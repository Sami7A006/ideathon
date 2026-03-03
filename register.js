/**
 * Register page — Supabase Integration.
 * Requires selected problem in localStorage (set from index.html "Select & Register").
 */
(function () {
  "use strict";

  // --- SUPABASE CONFIGURATION ---
  // Replace these with your actual Supabase URL and Anon Key
  const SUPABASE_URL = "https://czmgcvjasnerkbtheqje.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bWdjdmphc25lcmtidGhlcWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNTIzMzYsImV4cCI6MjA4NzkyODMzNn0.dD_dzV5kf_wGXbStRVq55tCtFPS61IHDRSoMeGxqmpk";

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // ------------------------------

  const STORAGE_KEY = "invenza_selected_problem";
  const REGISTERED_LOCK_KEY = "registered";

  function getSelectedProblem() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function redirectToDomains() {
    window.location.replace("index.html#domains");
  }

  function showSuccessView() {
    var headerEl = document.getElementById("registerHeader");
    var formWrap = document.getElementById("registerFormWrap");
    var successEl = document.getElementById("registerSuccess");
    if (headerEl) headerEl.classList.add("hidden");
    if (formWrap) formWrap.classList.add("hidden");
    if (successEl) successEl.classList.remove("hidden");
  }

  function showError(message) {
    var errEl = document.getElementById("registerError");
    if (!errEl) return;
    errEl.textContent = message;
    errEl.classList.remove("hidden");
  }

  function hideError() {
    var errEl = document.getElementById("registerError");
    if (!errEl) return;
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }

  function pad3(n) {
    return String(n).padStart(3, "0");
  }

  async function generateTeamID() {
    // Basic approach: Count existing rows and add 1
    // Note: This might have race conditions if many register at the same second, 
    // but works for basic use cases without Postgres functions.
    const { count, error } = await supabaseClient
      .from('registrations')
      .select('*', { count: 'exact', head: true });

    if (error) throw new Error("Could not determine Team ID (possibly incorrect Supabase credentials). " + error.message);

    const nextCount = (count || 0) + 1;
    return "INV-" + pad3(nextCount);
  }

  function init() {
    var selected = getSelectedProblem();

    if (!selected || !selected.domain || !selected.title) {
      redirectToDomains();
      return;
    }

    var selectedText = selected.domain + " — " + selected.title;
    var displayEl = document.getElementById("registerProblemDisplay");
    var selectedInput = document.getElementById("selectedProblem");
    var domainInput = document.getElementById("domain");

    if (displayEl) displayEl.textContent = "Selected problem: " + selected.title;
    if (selectedInput) selectedInput.value = selectedText;
    if (domainInput) domainInput.value = selected.domain || "";

    var formEl = document.getElementById("registerForm");
    var submitBtn = document.getElementById("registerSubmit");

    if (formEl) {
      formEl.addEventListener("submit", async function (e) {
        e.preventDefault();
        hideError();

        // Check if already registered on this device
        try {
          if (localStorage.getItem(REGISTERED_LOCK_KEY)) {
            showError("You have already registered.");
            return;
          }
        } catch (err) { }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Registering...";
        }

        try {
          // Check if email already exists
          const email = document.getElementById("email").value.trim().toLowerCase();
          const { data: existingUser, error: checkError } = await supabaseClient
            .from('registrations')
            .select('id')
            .eq('email', email)
            .limit(1);

          if (checkError) throw checkError;
          if (existingUser && existingUser.length > 0) {
            throw new Error("This email is already registered.");
          }

          // Generate Team ID
          const teamID = await generateTeamID();

          // Prepare data
          const formData = {
            team_name: document.getElementById("teamName").value.trim(),
            leader_name: document.getElementById("leaderName").value.trim(),
            number_of_team_members: parseInt(document.getElementById("teamCount").value, 10),
            email: email,
            phone: document.getElementById("phone").value.trim(),
            selected_problem: selectedText,
            domain: selected.domain || "",
            team_id: teamID
          };

          // Insert into Supabase
          const { error: insertError } = await supabaseClient
            .from('registrations')
            .insert([formData]);

          if (insertError) {
            // Handle unique constraint violations
            if (insertError.code === '23505') {
              throw new Error("A constraint error occurred (possibly duplicate team name or email). Please try a different team name or try again.");
            }
            throw insertError;
          }

          // Success! Show success view and Team ID
          showSuccessView();

          var successTextEl = document.querySelector(".register-success-text");
          if (successTextEl) {
            successTextEl.innerHTML = `Thank you for registering. We have received your details for the selected problem.<br><br><strong>Your Team ID: ${teamID}</strong>`;
          }

          // Mark as registered in local storage
          try {
            localStorage.setItem(REGISTERED_LOCK_KEY, "true");
            localStorage.removeItem(STORAGE_KEY);
          } catch (err) { }

        } catch (err) {
          showError(err.message || "An error occurred during registration. Check your Supabase URL/Key.");
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Register";
          }
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
