export const route = $state({ path: "/" });
const read = () => (route.path = location.hash.replace(/^#/, "").split("?")[0] || "/");
read();
window.addEventListener("hashchange", read);
