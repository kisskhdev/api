export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ១. កំណត់ CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ២. ទាញយក និង Decode URL (Base64 URL Safe)
    let encodedUrl = url.searchParams.get('v') || url.pathname.match(/\/media\/(.*?)(\.(mp4|mkv|mov))?$/)?.[1];
    if (!encodedUrl) return new Response("Not Found", { status: 404 });

    try {
      let base64 = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const targetUrl = decodeURIComponent(Array.prototype.map.call(atob(base64), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

      // ៣. រៀបចំ Request ទៅកាន់ Server ដើម
      const rangeHeader = request.headers.get("Range");
      const newHeaders = new Headers();
      newHeaders.set("User-Agent", request.headers.get("User-Agent") || "Mozilla/5.0");
      newHeaders.set("Referer", new URL(targetUrl).origin + "/");
      if (rangeHeader) {
          newHeaders.set("Range", rangeHeader);
      }

      // ៤. Fetch ដាតា (ប្រើប្រព័ន្ធ Streaming របស់ Cloudflare)
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: newHeaders,
        cf: {
          cacheEverything: false, // បិទ Cache ដើម្បីឱ្យដាតាហូរទៅភ្លាមៗ
          cacheTtl: 0
        }
      });

      // ៥. បង្កើត Response ថ្មី ហើយបោះដាតាទៅ Browser វិញភ្លាមៗ (Transparent Stream)
      const proxyResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...corsHeaders,
          "Content-Type": response.headers.get("Content-Type") || "video/mp4",
          "Content-Length": response.headers.get("Content-Length"),
          "Content-Range": response.headers.get("Content-Range"),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff"
        },
      });

      return proxyResponse;

    } catch (e) {
      return new Response("Error: " + e.message, { status: 500 });
    }
  }
};