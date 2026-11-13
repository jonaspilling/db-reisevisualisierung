import tempfile
import unittest
from unittest.mock import Mock, patch

from scripts import build_routes


class RailGraphTests(unittest.TestCase):
    def test_large_overpass_queries_are_split_into_batches(self):
        pairs = [
            ("Frankfurt(Main)Hbf", "Köln Hbf"),
            ("München Hbf", "Berlin Südkreuz"),
            ("Lille Europe", "Innsbruck Hbf"),
        ]

        queries = build_routes.build_overpass_queries(pairs, boxes_per_query=2)

        self.assertEqual(len(queries), 2)
        self.assertTrue(all(query.endswith("out body geom;") for query in queries))

    def test_overpass_query_does_not_exclude_railways_with_service_tags(self):
        query = build_routes.build_overpass_query(
            [("Frankfurt(Main)Hbf", "Köln Hbf")]
        )

        self.assertIn('way["railway"="rail"]', query)
        self.assertNotIn('["service"', query)

    def test_overpass_request_fails_over_to_an_alternate_service(self):
        response = Mock()
        response.json.return_value = {"elements": [{"type": "way"}]}
        connection_error = build_routes.requests.ConnectionError("502 Bad Gateway")

        # Eigener Cache-Ordner, damit der Test weder den echten Cache liest noch füllt.
        with tempfile.TemporaryDirectory() as cache_dir, patch.object(
            build_routes, "CACHE_DIR", cache_dir
        ), patch.object(
            build_routes.requests,
            "post",
            side_effect=[connection_error, response],
        ) as post:
            data = build_routes.fetch_overpass_data("query")

        self.assertEqual(data, {"elements": [{"type": "way"}]})
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[1].args[0], build_routes.OVERPASS_URLS[1])

    def test_builds_bidirectional_edges_including_service_tracks(self):
        graph, node_coords = build_routes.build_rail_graph(
            {
                "elements": [
                    {
                        "nodes": [1, 2, 3],
                        "geometry": [
                            {"lon": 8.0, "lat": 50.0},
                            {"lon": 8.1, "lat": 50.1},
                            {"lon": 8.2, "lat": 50.2},
                        ],
                        "tags": {"railway": "rail"},
                    },
                    {
                        "nodes": [3, 4],
                        "geometry": [
                            {"lon": 8.2, "lat": 50.2},
                            {"lon": 8.3, "lat": 50.3},
                        ],
                        "tags": {"railway": "rail", "service": "siding"},
                    },
                ]
            }
        )

        self.assertIn(2, graph[1])
        self.assertIn(1, graph[2])
        self.assertIn(4, graph[3])
        self.assertEqual(node_coords[2], [8.1, 50.1])

    def test_connects_geometry_when_osm_node_ids_are_missing(self):
        graph, _ = build_routes.build_rail_graph(
            {
                "elements": [
                    {
                        "geometry": [
                            {"lon": 8.0, "lat": 50.0},
                            {"lon": 8.1, "lat": 50.1},
                        ],
                        "tags": {"railway": "rail"},
                    },
                    {
                        "geometry": [
                            {"lon": 8.1, "lat": 50.1},
                            {"lon": 8.2, "lat": 50.2},
                        ],
                        "tags": {"railway": "rail"},
                    },
                ]
            }
        )

        self.assertEqual(
            build_routes.shortest_rail_path(
                graph,
                (8.0, 50.0),
                (8.2, 50.2),
            ),
            [(8.0, 50.0), (8.1, 50.1), (8.2, 50.2)],
        )

    def test_shortest_path_uses_track_distance(self):
        graph = {
            1: {2: 1.0, 3: 1.5},
            2: {1: 1.0, 4: 1.0},
            3: {1: 1.5, 4: 1.5},
            4: {2: 1.0, 3: 1.5},
        }

        self.assertEqual(build_routes.shortest_rail_path(graph, 1, 4), [1, 2, 4])
        self.assertEqual(build_routes.shortest_rail_path(graph, 4, 1), [4, 2, 1])


class RouteSegmentTests(unittest.TestCase):
    def setUp(self):
        build_routes.segment_cache.clear()
        build_routes.station_node_cache.clear()
        # Filter aus früheren Graph-Aufbauten dürfen hier nicht nachwirken.
        build_routes.main_component = None
        build_routes.usable_nodes = None
        build_routes.fern_nodes = None

    def test_route_uses_intermediate_osm_track_nodes(self):
        node_coords = {
            1: [8.664, 50.107],
            2: [8.6, 50.08],
            3: [8.57, 50.053],
        }
        graph = {
            1: {2: 5.0},
            2: {1: 5.0, 3: 4.0},
            3: {2: 4.0},
        }

        paths, distance = build_routes.route_segment(
            "Frankfurt(Main)Hbf",
            "Frankfurt(M) Flughafen Fernbf",
            graph,
            node_coords,
        )

        self.assertEqual(paths[0][0], [8.6638, 50.1071])
        self.assertIn([8.6, 50.08], paths[0])
        self.assertEqual(paths[0][-1], [8.57, 50.0531])
        self.assertGreater(distance, 0)

    def test_reverse_trip_reuses_the_track_in_reverse(self):
        node_coords = {
            1: [8.664, 50.107],
            2: [8.6, 50.08],
            3: [8.57, 50.053],
        }
        graph = {
            1: {2: 5.0},
            2: {1: 5.0, 3: 4.0},
            3: {2: 4.0},
        }

        forward, _ = build_routes.route_segment(
            "Frankfurt(Main)Hbf",
            "Frankfurt(M) Flughafen Fernbf",
            graph,
            node_coords,
        )
        reverse, _ = build_routes.route_segment(
            "Frankfurt(M) Flughafen Fernbf",
            "Frankfurt(Main)Hbf",
            graph,
            node_coords,
        )

        self.assertEqual(reverse[0], list(reversed(forward[0])))


if __name__ == "__main__":
    unittest.main()
