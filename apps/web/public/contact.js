const supportForm = document.querySelector("#support-form");
const supportStatus = document.querySelector("#support-form-status");

supportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = supportForm.querySelector("button[type='submit']");
  const formData = new FormData(supportForm);
  const payload = Object.fromEntries(formData.entries());

  submitButton.disabled = true;
  supportStatus.className = "support-form-status";
  supportStatus.textContent = "Sending your request…";

  try {
    const response = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Support request failed.");

    supportForm.reset();
    supportStatus.className = "support-form-status is-success";
    supportStatus.textContent = `${result.message} Reference: ${result.reference}.`;
  } catch (error) {
    supportStatus.className = "support-form-status is-error";
    supportStatus.textContent = error instanceof Error
      ? error.message
      : "Could not send the request. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});
