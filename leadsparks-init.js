(function () {
  function getScriptQueryParams(scriptId) {
    const script = document.getElementById(scriptId);
    if (!script) {
      console.error("Script with specified ID not found");
      return {};
    }
    const queryString = script.src.split("?")[1];
    const params = {};
    if (queryString) {
      const queryArray = queryString.split("&");
      for (let i = 0; i < queryArray.length; i++) {
        const pair = queryArray[i].split("=");
        if (pair.length === 2) {
          params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
        }
      }
    }
    return params;
  }

  const params = getScriptQueryParams("load-leadsparks-script");
  const apiUrl = "https://stream.leadsparks.io";
  const streamId = params.streamId;
  const errorContent = `
    <div
      style="padding: 20px;
      border: 1px solid red;
      color: red;
      font-size: 16px;
      text-align: center;
      font-family: monospace";
    >
      Lead Spark not loaded. Please check your script or contact Lead Spark support team.
    </div>
  `;

  (async function () {
    if (!apiUrl || !streamId) {
      console.error("API URL or Stream ID is missing or undefined");
      const leadSparks = document.querySelector("#leadsparks_load_target");
      leadSparks.innerHTML = errorContent;
      return;
    }

    try {
      const token = localStorage.getItem("session_token");
      const tokenResponse = await fetch(
          `${apiUrl}/api/generate-token?stream_id=${streamId}&session_token=${token}`
      );
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(`Token fetch error! status: ${tokenResponse.status}`);
      }
      const sessionToken = tokenData.session.session_token;
      localStorage.setItem("session_token", sessionToken);

      if (!token) {
        localStorage.setItem("isNewToken", true);
        window.location.reload();
      }

      const leadSparks = document.querySelector("#leadsparks_load_target");
      if (tokenData.success) {
        const sessionToken = tokenData.session.session_token;
        const iframe = document.createElement("iframe");
        iframe.src = `${apiUrl}/lead-spark-init?session_token=${sessionToken}`;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.id = "lead__spark";
        leadSparks.appendChild(iframe);

        iframe.onload = () => {
          console.log('iframe loading')
          const requestIframeHandshake = () => {
            console.log('request-handshake loading')
            const origin = new URL(iframe.src).origin;
            iframe.contentWindow.postMessage(
                {
                  type: "request-handshake",
                  sessionToken,
                  isNewToken: localStorage.getItem("isNewToken"),
                },
                origin
            );
          };

          requestIframeHandshake();

          window.addEventListener("message", (event) => {
            const secureToken = sessionToken;
            if (event.data === "handshake-init") {
              const origin = new URL(iframe.src).origin;
              iframe.contentWindow.postMessage(
                  { type: "handshake", token: secureToken },
                  origin
              );
            } else if (
                event.data.type === "handshake-ack" &&
                event.data.token === secureToken
            ) {
              console.log("Handshake successful");
              localStorage.removeItem("isNewToken")
            } else if (event.data.type === "cors-error") {
              console.error(
                  "CORS Error: The origin of the request is not allowed. Please check the allowed domains or contact support for assistance."
              );
            }
          });
        };
      } else {
        leadSparks.innerHTML = errorContent;
      }
    } catch (error) {
      console.log('error', error)
      localStorage.clear();
      window.location.reload();
      const leadSparks = document.querySelector("#leadsparks_load_target");
      leadSparks.innerHTML = errorContent;
    }
  })();
})();