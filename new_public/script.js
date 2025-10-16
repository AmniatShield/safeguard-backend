document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("input-btn");
  const outputBox = document.getElementById("output-box");
  const aiSection = document.getElementById("ai-section");
  const loading = document.getElementById("loading");
  const title = document.getElementById("title");
  const inputBox = document.getElementById("input-box");
  const aiChat = document.getElementById("ai-chat");
  const textInput = document.getElementById("text");
  const sendButton = document.getElementById("send");

  // Initial AI message (but only when shown)
  function initChat() {
    appendMessage("سلام! چطور می‌توانم کمکتان کنم؟", "ai");
  }

  // Drag and drop handling
  window.handleDrop = function (event) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith(".exe")) {
      fileInput.files = event.dataTransfer.files;
      fileInput.dispatchEvent(new Event("change"));
    } else {
      alert("فقط فایل‌های .exe مجاز هستند.");
    }
  };

  // File upload handling
  fileInput.addEventListener("change", () => {
    document.fileform.submit();
    showLoading();
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/update");
        const data = await response.json();
        if (data.results) {
          displayFileDetails(
            data.results,
            data.fileName,
            data.fileSize,
            data.fileHash
          );
          clearInterval(pollInterval);
          hideLoading();
          outputBox.classList.remove("hidden");
          aiSection.classList.remove("hidden");
          initChat(); // Init chat only after analysis
        }
      } catch (error) {
        console.error("Error polling update:", error);
      }
    }, 1000);
  });

  // Chat handling
  sendButton.addEventListener("click", sendMessage);
  textInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  function showLoading() {
    loading.classList.remove("hidden");
    title.classList.add("hidden");
    inputBox.classList.add("hidden");
  }

  function hideLoading() {
    loading.classList.add("hidden");
    title.classList.remove("hidden");
  }

  function displayFileDetails(aiResponse, fileName, fileSize, fileHash) {
    document.getElementById("aiDesc").innerHTML = aiResponse;
    document.getElementById("fileName").innerHTML = `نام: ${fileName}`;
    document.getElementById("fileSize").innerHTML = `اندازه: ${Number(
      fileSize
    ).toFixed(1)} MB`;
    document.getElementById(
      "fileHash"
    ).innerHTML = `هش MD5: <code>${fileHash}</code>`;
  }

  window.copyHash = function () {
    const hash = document.querySelector("#fileHash code").textContent;
    navigator.clipboard.writeText(hash).then(() => {
      alert("هش کپی شد!");
    });
  };

  async function sendMessage() {
    const message = textInput.value.trim();
    if (!message) return;
    appendMessage(message, "user");
    textInput.value = "";
    sendButton.disabled = true;
    const thinkingDiv = appendMessage("در حال فکر...", "ai");
    try {
      const response = await fetch("/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      thinkingDiv.querySelector("span").innerHTML = data.result;
    } catch (error) {
      console.error("Error sending message:", error);
      thinkingDiv.querySelector("span").innerHTML =
        "خطا در ارتباط با هوش مصنوعی.";
    }
    sendButton.disabled = false;
  }

  function appendMessage(text, type) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");
    if (type === "user") {
      messageDiv.classList.add("user-message");
    } else {
      messageDiv.classList.add("ai-message");
    }
    const icon = document.createElement("i");
    icon.classList.add("fa");
    if (type === "user") {
      icon.classList.add("fa-user");
    } else {
      icon.classList.add("fa-robot");
    }
    messageDiv.appendChild(icon);
    const textSpan = document.createElement("span");
    textSpan.innerHTML = text;
    messageDiv.appendChild(textSpan);
    aiChat.appendChild(messageDiv);
    aiChat.scrollTop = aiChat.scrollHeight;
    return messageDiv;
  }
});
