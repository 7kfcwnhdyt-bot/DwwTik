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

    // =========================
    // API health check
    // =========================
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "DwwTik API",
      });
    }

    // =========================
    // Validate TikTok URL
    // =========================
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

    // =========================
    // Download / extract
    // TikTok or Instagram
    // =========================
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
            type: "video",
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

        // =========================
        // TikTok Video
        // =========================
        const videoApiResponse = await fetch(
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

        if (!videoApiResponse.ok) {
          const errorText = await videoApiResponse.text();

          return json(
            {
              ok: false,
              error:
                "AnyAPI error " +
                videoApiResponse.status +
                ": " +
                errorText.slice(0, 300),
            },
            502
          );
        }

        const videoResult = await videoApiResponse.json();

        // AnyAPI supports both direct and normalized envelope
        const videoOutput =
          videoResult.output || videoResult;

        const videoData = videoOutput?.data;

        // =========================
        // TikTok Video Found
        // =========================
        if (
          videoOutput?.found &&
          videoData &&
          videoData.videoUrl
        ) {
          return json({
            ok: true,
            type: "video",

            video: {
              url: videoData.videoUrl || null,
              hd: videoData.videoUrl || null,
              watermark:
                videoData.watermarkedUrl || null,
              watermarkSize: null,
              cover: videoData.image || null,
              title: "",
            },

            author: null,
            music: null,
            id: videoData.id || null,
          });
        }

        // =========================
        // TikTok Photos
        // =========================
        const photosApiResponse = await fetch(
          "https://api.getanyapi.com/v1/run/tiktok.photos",
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

        if (!photosApiResponse.ok) {
          const errorText = await photosApiResponse.text();

          return json(
            {
              ok: false,
              error:
                "AnyAPI photos error " +
                photosApiResponse.status +
                ": " +
                errorText.slice(0, 300),
            },
            502
          );
        }

        const photosResult = await photosApiResponse.json();

        // AnyAPI supports both direct and normalized envelope
        const photosOutput =
          photosResult.output || photosResult;

        const photosData = photosOutput?.data;

        // =========================
        // Photos Found
        // =========================
        if (
          photosOutput?.found &&
          photosData &&
          Array.isArray(photosData.images) &&
          photosData.images.length
        ) {
          const photos = photosData.images
            .filter((item) => item && item.image)
            .map((item, index) => ({
              index: index + 1,
              url: item.image,
              watermark:
                item.watermarkedImage || null,
              width: item.width || null,
              height: item.height || null,
            }));

          if (photos.length) {
            return json({
              ok: true,
              type: "photos",
              photos,
              id: photosData.id || null,
            });
          }
        }

        // =========================
        // Nothing Found
        // =========================
        return json(
          {
            ok: false,
            error:
              "No downloadable video or photos found.",
          },
          422
        );
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
    if (
      url.pathname === "/api/file" &&
      request.method === "GET"
    ) {
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
              error:
                "Invalid video source: " +
                target.hostname,
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
          videoResponse.headers.get("Content-Type") ||
            "video/mp4"
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

    // =========================
    // Download image file
    // =========================
    if (
      url.pathname === "/api/image" &&
      request.method === "GET"
    ) {
      try {
        const imageUrl = url.searchParams.get("url");

        if (!imageUrl) {
          return json(
            {
              ok: false,
              error: "Image URL is required",
            },
            400
          );
        }

        const target = new URL(imageUrl);

        if (
          !target.hostname.endsWith(".tiktokcdn.com") &&
          !target.hostname.endsWith(".tiktokcdn-us.com") &&
          !target.hostname.endsWith(".tiktokv.us") &&
          !target.hostname.endsWith(".tiktokv.com")
        ) {
          return json(
            {
              ok: false,
              error:
                "Invalid image source: " +
                target.hostname,
            },
            400
          );
        }

        const imageResponse = await fetch(target);

        if (!imageResponse.ok) {
          return json(
            {
              ok: false,
              error: "Could not download image",
            },
            502
          );
        }

        const headers = new Headers(corsHeaders);

        headers.set(
          "Content-Type",
          imageResponse.headers.get("Content-Type") ||
            "image/jpeg"
        );

        headers.set(
          "Content-Disposition",
          'attachment; filename="DwwTik-image.jpg"'
        );

        return new Response(imageResponse.body, {
          status: 200,
          headers,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Could not download image",
          },
          500
        );
      }
    }

    // =========================
    // Endpoint not found
    // =========================
    return json(
      {
        ok: false,
        error: "Endpoint not found",
      },
      404
    );
  },
};
