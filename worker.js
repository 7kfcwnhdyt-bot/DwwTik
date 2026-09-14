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

    // Download / extract TikTok or Instagram video
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
              error: "Video URL is required",
            },
            400
          );
        }

        // =========================
        // Instagram
        // =========================
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
            (item) => item.type === "video"
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

        // =========================
        // TikTok
        // =========================
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

        // Send TikTok URL directly to AnyAPI
        const apiResponse = await fetch(
          "https://api.getanyapi.com/v1/run/tiktok.video_download",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.ANYAPI_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: videoUrl,
            }),
          }
        );

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();

          return json(
            {
              ok: false,
              error:
                "AnyAPI error " +
                apiResponse.status +
                ": " +
                errorText.slice(0, 300),
            },
            502
          );
        }

        const result = await apiResponse.json();

        // AnyAPI normalized response
        const output = result.output || result;
        const data = output?.data;

        // Photo posts / unavailable videos
        if (!output?.found || !data) {
          return json(
            {
              ok: false,
              error:
                "No downloadable video found. TikTok photo posts are not supported yet.",
            },
            422
          );
        }

        if (!data.videoUrl) {
          return json(
            {
              ok: false,
              error: "TikTok video URL was not found",
            },
            422
          );
        }

        return json({
          ok: true,

          video: {
            url: data.videoUrl || null,
            hd: data.videoUrl || null,
            watermark: data.watermarkedUrl || null,
            watermarkSize: null,
            cover: data.image || null,
            title: "",
          },

          author: null,
          music: null,
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

    // =========================
    // Download video file
    // =========================
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
          target.hostname !== "tikwm.com" &&
          !target.hostname.endsWith(".tiktokv.us") &&
          !target.hostname.endsWith(".cdninstagram.com")
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
