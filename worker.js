export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // Helper
    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // API health check
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "DwwTik API",
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
          /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(
            videoUrl
          );

        return json({
          ok: true,
          valid: isTikTok,
          url: videoUrl,
        });
      } catch {
        return json(
          {
            ok: false,
            error: "Invalid request",
          },
          400
        );
      }
    }

    // Download / extract TikTok video
    if (
      url.pathname === "/api/download" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const videoUrl = String(body.url || "").trim();

        if (!videoUrl) {
          return json(
            {
              ok: false,
              error: "TikTok URL is required",
            },
            400
          );
        }
                // Handle Instagram
                const isInstagram =
                    /^https?:\/\/(www\.)?instagram\.com\//i.test(videoUrl);

                if (isInstagram) {
                    const apiResponse = await fetch(
                        "https://api.saveapi.org/v1/download?url=" +
                        encodeURIComponent(videoUrl),
                        {
                            method: "GET",
                            headers: {
                                "Authorization": `Bearer ${env.SAVEAPI_KEY}`,
                            },
                        }
                    );

                    if (!apiResponse.ok) {
    const errorText = await apiResponse.text();

    return json(
        {
            ok: false,
            error:
                "SaveAPI error " +
                apiResponse.status +
                ": " +
                errorText.slice(0, 300),
        },
        502
    );
}           

                    const result = await apiResponse.json();

                    if (
                        !result.success ||
                        !result.medias ||
                        !result.medias.length
                    ) {
                        return json(
                            {
                                ok: false,
                                error: "Could not extract Instagram video",
                            },
                            422
                        );
                    }

                    const media = result.medias.find(
                        item => item.type === "video"
                    );

                    if (!media || !media.url) {
                        return json(
                            {
                                ok: false,
                                error: "Instagram video not found",
                            },
                            422
                        );
                    }

                    return json({
                        ok: true,
                        video: {
                            url: media.url,
                            hd: media.url,
                            watermark: null,
                            watermarkSize: null,
                            cover: null,
                            title: result.meta?.title || "",
                        },
                        author: null,
                        music: null,
                        id: null,
                    });
                }
        // Validate TikTok URL
        const isTikTok =
          /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(
            videoUrl
          );

        if (!isTikTok) {
          return json(
            {
              ok: false,
              error: "Invalid TikTok URL",
            },
            400
          );
        }
let apiVideoUrl = videoUrl;

try {
    const inputUrl = new URL(videoUrl);

    if (
        inputUrl.hostname === "vt.tiktok.com" ||
        inputUrl.hostname === "vm.tiktok.com"
    ) {
        const redirectResponse = await fetch(inputUrl, {
            redirect: "follow",
        });

        if (redirectResponse.url) {
            apiVideoUrl = redirectResponse.url;
        }
    }
} catch (error) {
    // Keep original URL if redirect resolution fails
}
        // Send URL to TikWM
        const apiResponse = await fetch(
          "https://www.tikwm.com/api/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
url: apiVideoUrl,
              hd: "1",
            }),
          }
        );

        if (!apiResponse.ok) {
          return json(
            {
              ok: false,
              error: "Downloader service unavailable",
            },
            502
          );
        }

        const result = await apiResponse.json();

        if (result.code !== 0 || !result.data) {
          return json(
            {
              ok: false,
              error: result.msg || "Could not extract video",
            },
            422
          );
        }

        const data = result.data;

        return json({
          ok: true,

          video: {
            url: data.play || null,
            hd: data.hdplay || null,
            watermark: data.wmplay || null,
            watermarkSize: data.wm_size || null,
            cover: data.cover || null,
            title: data.title || "",
          },

          author: data.author
            ? {
                username: data.author.unique_id || "",
                nickname: data.author.nickname || "",
                avatar: data.author.avatar || "",
              }
            : null,

          music: data.music || null,

          id: data.id || null,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Something went wrong",
          },
          500
        );
      }
    }
    // Download video file
    if (url.pathname === "/api/file" && request.method === "GET") {
      try {
        const videoUrl = url.searchParams.get("url");

        if (!videoUrl) {
          return json(
            {
              ok: false,
              error: "Video URL is required",
            },
            400
          );
        }

        const target = new URL(videoUrl);

        if (
    !target.hostname.endsWith(".tiktokcdn.com") &&
    !target.hostname.endsWith(".tiktokcdn-us.com") &&
    !target.hostname.endsWith(".tikwm.com") &&
    target.hostname !== "tikwm.com"
          &&
!target.hostname.endsWith(".tiktokv.us")
) {
          return json(
            {
              ok: false,
error: "Invalid video source: " + target.hostname,
            },
            400
          );
        }

        const videoResponse = await fetch(target);

        if (!videoResponse.ok) {
          return json(
            {
              ok: false,
              error: "Could not download video",
            },
            502
          );
        }

        const headers = new Headers(corsHeaders);
        headers.set(
          "Content-Type",
          videoResponse.headers.get("Content-Type") || "video/mp4"
        );
        headers.set(
          "Content-Disposition",
          'attachment; filename="DwwTik-video.mp4"'
        );

        return new Response(videoResponse.body, {
          status: 200,
          headers,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Could not download video",
          },
          500
        );
      }
    }
    return json(
      {
        ok: false,
        error: "Endpoint not found",
      },
      404
    );
  },
};
