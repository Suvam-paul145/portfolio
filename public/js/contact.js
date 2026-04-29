export function initContactForm() {
  const form = document.getElementById("contactForm");
  const submit = document.getElementById("contactSubmitBtn");
  const status = document.getElementById("formStatus");

  if (!form || !submit || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    status.dataset.state = "";
    status.textContent = "Sending your message...";
    submit.disabled = true;
    submit.textContent = "Sending...";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Something went wrong while sending your message.");
      }

      status.dataset.state = "success";
      status.textContent = result.message || "Message sent successfully.";
      form.reset();
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error.message || "Unable to send message right now.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Send message";
    }
  });
}
