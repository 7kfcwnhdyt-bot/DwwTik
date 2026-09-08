export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API health check
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "DwwTik API"
      });
    }

    // Validate TikTok URL
    if (
      url.pathname === "/api/validate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const videoUrl = String(body.url || "").trim();

        const isTikTok =
          /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(videoUrl);

        return Response.json({
          ok: true,
          valid: isTikTok,
          url: videoUrl
        });
      } catch {
        return Response.json(
          {
            ok: false,
            error: "Invalid request"
          },
          { status: 400 }
        );
      }
    }

    // Serve the website
    return env.ASSETS.fetch(request);
  }
};
