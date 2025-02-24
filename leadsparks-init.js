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
  const MAX_RETRIES = 3;
  const HANDSHAKE_TIMEOUT = 5000;
  const RETRY_DELAY = 1000;

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

  class HandshakeManager {
    constructor(iframe, sessionToken) {
      this.iframe = iframe;
      this.sessionToken = sessionToken;
      this.retryCount = 0;
      this.timeoutId = null;
      this.handshakeSuccessful = false;
    }

    startHandshake() {
      this.setupMessageListener();
      this.requestHandshake();
      this.startTimeout();
    }

    setupMessageListener() {
      this.messageHandler = (event) => {
        const secureToken = this.sessionToken;

        if (event.data === "handshake-init") {
          const origin = new URL(this.iframe.src).origin;
          this.iframe.contentWindow.postMessage(
            { type: "handshake", token: secureToken },
            origin
          );
        } else if (
          event.data.type === "handshake-ack" &&
          event.data.token === secureToken
        ) {
          this.handleSuccess();
        } else if (event.data.type === "cors-error") {
          this.handleError(
            "CORS Error: The origin of the request is not allowed."
          );
        }
      };

      window.addEventListener("message", this.messageHandler);
    }

    requestHandshake() {
      console.log(
        `Attempting handshake (try ${this.retryCount + 1}/${MAX_RETRIES})`
      );
      const origin = new URL(this.iframe.src).origin;
      this.iframe.contentWindow.postMessage(
        {
          type: "request-handshake",
          sessionToken: this.sessionToken,
          isNewToken: localStorage.getItem("isNewToken"),
        },
        origin
      );
    }

    startTimeout() {
      this.timeoutId = setTimeout(() => {
        if (!this.handshakeSuccessful) {
          this.handleTimeout();
        }
      }, HANDSHAKE_TIMEOUT);
    }

    handleSuccess() {
      console.log("Handshake successful");
      this.handshakeSuccessful = true;
      this.cleanup();
      localStorage.removeItem("isNewToken");
    }

    handleTimeout() {
      console.log("Handshake timeout");
      if (this.retryCount < MAX_RETRIES) {
        this.retryCount++;
        setTimeout(() => {
          this.requestHandshake();
          this.startTimeout();
        }, RETRY_DELAY);
      } else {
        this.handleError("Maximum retries reached");
      }
    }

    handleError(error) {
      console.error(error);
      this.cleanup();
      const leadSparks = document.querySelector("#leadsparks_load_target");
      leadSparks.innerHTML = errorContent;
      localStorage.clear();
    }

    cleanup() {
      clearTimeout(this.timeoutId);
      window.removeEventListener("message", this.messageHandler);
    }
  }

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
        const iframe = document.createElement("iframe");
        iframe.src = `${apiUrl}/lead-spark-init?session_token=${sessionToken}`;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.id = "lead__spark";

        // Handle iframe load errors
        iframe.onerror = () => {
          console.error("iframe failed to load");
          leadSparks.innerHTML = errorContent;
        };

        iframe.onload = () => {
          const handshakeManager = new HandshakeManager(iframe, sessionToken);
          handshakeManager.startHandshake();
        };

        leadSparks.appendChild(iframe);
      } else {
        leadSparks.innerHTML = errorContent;
      }
    } catch (error) {
      console.log("error", error);
      localStorage.clear();
      const leadSparks = document.querySelector("#leadsparks_load_target");
      leadSparks.innerHTML = errorContent;
    }
  })();
})();
