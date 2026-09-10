/**
 * SpeedLead embeddable lead form widget.
 *
 * Usage (paste into any customer website):
 *   <script src="https://app.speedlead.io/widget.js" data-token="PUBLIC_TOKEN" async></script>
 *
 * Renders a minimal, dependency-free lead form in place of the <script>
 * tag and posts submissions to the public /api/leads/submit/:token
 * endpoint (CORS-enabled — see src/app/api/leads/submit/[token]/route.ts).
 */
(function () {
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var token = currentScript.getAttribute("data-token");
  if (!token) {
    console.error("[SpeedLead widget] missing data-token attribute.");
    return;
  }

  var origin = new URL(currentScript.src).origin;
  var endpoint = origin + "/api/leads/submit/" + token;

  var container = document.createElement("div");
  container.className = "sl-widget";
  container.innerHTML =
    '<style>' +
    ".sl-widget{font-family:system-ui,-apple-system,sans-serif;max-width:360px;border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff}" +
    ".sl-widget h3{margin:0 0 8px;font-size:16px;color:#0f172a}" +
    ".sl-widget input,.sl-widget textarea{width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}" +
    ".sl-widget button{width:100%;padding:10px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer}" +
    ".sl-widget button:disabled{opacity:.6;cursor:default}" +
    ".sl-widget .sl-success{color:#059669;font-size:14px}" +
    ".sl-widget .sl-error{color:#dc2626;font-size:13px;margin-top:6px}" +
    ".sl-widget .sl-hp{position:absolute;left:-9999px}" +
    "</style>" +
    '<form>' +
    "<h3>Get a fast response</h3>" +
    '<input class="sl-hp" name="website" tabindex="-1" autocomplete="off" />' +
    '<input name="name" placeholder="Name" required />' +
    '<input name="phone" placeholder="Phone" required />' +
    '<input name="email" type="email" placeholder="Email (optional)" />' +
    '<textarea name="message" rows="3" placeholder="What do you need help with?"></textarea>' +
    '<button type="submit">Request a callback</button>' +
    '<div class="sl-msg"></div>' +
    "</form>";

  currentScript.insertAdjacentElement("afterend", container);

  var form = container.querySelector("form");
  var msg = container.querySelector(".sl-msg");
  var button = container.querySelector("button");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    button.disabled = true;
    msg.innerHTML = "";

    var formData = new FormData(form);
    var payload = {};
    formData.forEach(function (value, key) {
      payload[key] = value;
    });

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (body) { throw new Error(body.error || "Request failed"); });
        return res.json();
      })
      .then(function () {
        form.style.display = "none";
        msg.innerHTML = '<p class="sl-success">Thanks! We got your request and will be in touch shortly.</p>';
      })
      .catch(function (err) {
        button.disabled = false;
        msg.innerHTML = '<p class="sl-error">' + (err.message || "Something went wrong. Please try again.") + "</p>";
      });
  });
})();
