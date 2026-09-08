export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "DwwTik API"
      });
    }

    return new Response("DwwTik API is running", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
