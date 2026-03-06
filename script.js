const API_BASE = "https://food-waste-backend-3.onrender.com";

function normalizeToken(token) {
  if (!token) return "";
  return String(token).replace(/^"+|"+$/g, "").trim();
}

function getStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return "";
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Ignore storage write failures in restricted browser contexts.
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Ignore storage remove failures in restricted browser contexts.
  }
}

const state = {
  token: normalizeToken(getStoredValue("token")),
  role: getStoredValue("role") || "",
  username: "",
  foodsHistory: [],
  requestsHistory: []
};

const moduleIds = [
  "accessModule",
  "feedModule",
  "requestModule",
  "insightsModule"
];
let activeModuleId = "accessModule";

function getModuleElement(id) {
  return document.getElementById(id);
}

function getVisibleModuleElements() {
  return moduleIds
    .map((id) => getModuleElement(id))
    .filter((el) => el && !el.classList.contains("unavailable"));
}

function renderModuleStepper() {
  const stepper = document.getElementById("moduleStepper");
  if (!stepper) return;

  const visibleModules = getVisibleModuleElements();
  stepper.innerHTML = "";

  visibleModules.forEach((module, index) => {
    const label = module.querySelector("h2")?.textContent || `Module ${index + 1}`;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `module-tab${module.id === activeModuleId ? " active" : ""}`;
    tab.textContent = `${index + 1}. ${label}`;
    tab.addEventListener("click", () => setActiveModule(module.id));
    stepper.appendChild(tab);
  });
}

function setActiveModule(moduleId) {
  const visibleModules = getVisibleModuleElements();
  if (!visibleModules.length) return;

  const isRequestedVisible = visibleModules.some((module) => module.id === moduleId);
  const safeModuleId = isRequestedVisible ? moduleId : visibleModules[0].id;

  moduleIds.forEach((id) => {
    const module = getModuleElement(id);
    if (!module) return;
    module.classList.toggle("active", id === safeModuleId);
  });

  activeModuleId = safeModuleId;
  renderModuleStepper();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setModuleAvailability() {
  const isLoggedIn = Boolean(state.token);

  moduleIds.forEach((id) => {
    const module = getModuleElement(id);
    if (!module) return;

    let isAvailable = false;

    if (id === "accessModule") {
      isAvailable = true;
    } else if (!isLoggedIn) {
      isAvailable = false;
    } else {
      isAvailable = true;
    }

    module.classList.toggle("unavailable", !isAvailable);
  });
}

function goToAdjacentModule(direction) {
  if (!state.token && direction > 0 && activeModuleId === "accessModule") {
    showToast("Please login first");
    return;
  }

  const visibleModules = getVisibleModuleElements();
  if (!visibleModules.length) return;

  const currentIndex = visibleModules.findIndex((module) => module.id === activeModuleId);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
  const targetIndex = safeCurrentIndex + direction;
  if (targetIndex < 0 || targetIndex >= visibleModules.length) return;
  setActiveModule(visibleModules[targetIndex].id);
}

function wireModuleNavigation() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const nav = button.dataset.nav;
      if (nav === "next") {
        goToAdjacentModule(1);
      } else if (nav === "prev") {
        goToAdjacentModule(-1);
      } else if (nav === "first") {
        setActiveModule("accessModule");
      }
    });
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) {
    alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function ensureAuthMessageNode() {
  const accessModule = document.getElementById("accessModule");
  if (!accessModule) return null;

  let message = document.getElementById("authMessage");
  if (!message) {
    message = document.createElement("p");
    message.id = "authMessage";
    message.className = "muted";
    accessModule.insertBefore(message, accessModule.querySelector(".auth-grid"));
  }
  return message;
}

function setAuthMessage(text, isError = false) {
  const message = ensureAuthMessageNode();
  if (!message) return;
  message.textContent = text || "";
  message.style.color = isError ? "#bf2f4a" : "";
}

function setFormBusy(formId, isBusy, busyText = "Please wait...") {
  const form = document.getElementById(formId);
  if (!form) return;
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  if (isBusy) {
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = busyText;
    submitButton.disabled = true;
    return;
  }

  submitButton.disabled = false;
  submitButton.textContent = submitButton.dataset.originalText || submitButton.textContent;
}

function setApiStatus(text) {
  const apiStatus = document.getElementById("apiStatus");
  if (apiStatus) {
    apiStatus.textContent = `Backend: ${text}`;
  }
}

function authHeader() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function applySession(username, tokenValue, roleValue) {
  const normalizedToken = normalizeToken(tokenValue);
  state.token = normalizedToken;
  state.role = roleValue;
  state.username = username || "";
  setStoredValue("token", normalizedToken);
  setStoredValue("role", roleValue);
  setAuthUI();
}

function clearSession() {
  state.token = "";
  state.role = "";
  state.username = "";
  removeStoredValue("token");
  removeStoredValue("role");
  setAuthUI();
}

async function api(path, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        ...authHeader()
      }
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Server timeout. Please try again.");
    }
    throw new Error("Network error. Check backend/CORS and try again.");
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || "Request failed";
    if (response.status === 401 && /invalid token|jwt expired/i.test(message)) {
      clearSession();
      throw new Error("Session expired. Please login again.");
    }
    throw new Error(message);
  }
  return data;
}

async function checkApi() {
  try {
    const response = await fetch(`${API_BASE}/`, { method: "GET" });
    if (!response.ok) {
      setApiStatus(`not reachable (${response.status})`);
      return;
    }
    setApiStatus(API_BASE);
  } catch (err) {
    setApiStatus("not reachable");
  }
}

function setAuthUI() {
  const roleText = state.role ? `${state.role.toUpperCase()} mode` : "Guest";
  const authText = state.token ? "Signed in" : "Signed out";
  const addFoodPanel = document.getElementById("addFoodPanel");
  const canAddFood = state.role === "admin" || state.role === "donor";

  document.getElementById("roleBadge").textContent = roleText;
  document.getElementById("authState").textContent = authText;
  if (addFoodPanel) {
    addFoodPanel.style.display = canAddFood ? "block" : "none";
  }
  setModuleAvailability();
  renderModuleStepper();
  const activeModule = getModuleElement(activeModuleId);
  if (!activeModule || activeModule.classList.contains("unavailable")) {
    setActiveModule("accessModule");
  }
}

function checkLocalSetupHint() {
  if (window.location.protocol === "file:") {
    showToast("Running as file://. If buttons fail, set CORS_ORIGIN or serve frontend via http://localhost");
  }
}

function buildFoodQuery() {
  const q = document.getElementById("searchInput").value.trim();
  const location = document.getElementById("filterLocation").value.trim();
  const minQuantity = document.getElementById("filterMinQty").value.trim();
  const category = document.getElementById("filterCategory").value;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (location) params.set("location", location);
  if (minQuantity) params.set("minQuantity", minQuantity);
  if (category) params.set("category", category);
  // Prevent stale cached feed responses across roles/sessions.
  params.set("_ts", Date.now().toString());
  return params.toString() ? `?${params.toString()}` : "";
}

function resetFeedFilters() {
  const filterForm = document.getElementById("filterForm");
  if (filterForm) {
    filterForm.reset();
  }
}

function renderFoods(foods) {
  const list = document.getElementById("foodList");
  list.innerHTML = "";

  if (!foods.length) {
    list.innerHTML = `<article class="item"><p class="muted">No food listings match your filters.</p></article>`;
    return;
  }

  foods.forEach((food) => {
    const card = document.createElement("article");
    card.className = "item";
    const canRequestPickup = state.role === "ngo";
    const requestAction = canRequestPickup
      ? `<button data-action="request" data-food-id="${food._id}">Request Pickup</button>`
      : "";
    const deleteAction = state.role === "admin" || state.role === "donor"
      ? `<button data-action="delete-food" data-food-id="${food._id}">Delete</button>`
      : "";

    card.innerHTML = `
      <div class="item-head">
        <strong>${food.foodName}</strong>
        <span class="pill pill-approved">${food.category || "mixed"}</span>
      </div>
      <div class="muted">${food.location} | Qty: ${food.quantity}</div>
      <div class="muted">Contact: ${food.contactName || "Not provided"} | ${food.contactNumber || "Not provided"}</div>
      <div class="item-actions">${requestAction}${deleteAction}</div>
    `;
    list.appendChild(card);
  });
}

function renderRequests(requests) {
  const list = document.getElementById("requestList");
  list.innerHTML = "";

  if (!requests.length) {
    list.innerHTML = `<article class="item"><p class="muted">No requests yet.</p></article>`;
    return;
  }

  requests.forEach((req) => {
    const statusClass = `pill-${req.status || "pending"}`;
    const adminButtons = state.role === "admin" && req.status === "pending"
      ? `
          <button data-action="approve" data-request-id="${req._id}">Approve</button>
          <button data-action="reject" data-request-id="${req._id}">Reject</button>
        `
      : "";

    const card = document.createElement("article");
    card.className = "item";
    card.innerHTML = `
      <div class="item-head">
        <strong>${req.foodId?.foodName || "Food removed"}</strong>
        <span class="pill ${statusClass}">${req.status}</span>
      </div>
      <div class="muted">NGO: ${req.userId?.username || "Unknown"}</div>
      <div class="muted">${req.foodId?.location || "No location"} | Qty: ${req.foodId?.quantity || "-"}</div>
      <div class="muted">Contact: ${req.foodId?.contactName || "Not provided"} | ${req.foodId?.contactNumber || "Not provided"}</div>
      <div class="item-actions">${adminButtons}</div>
    `;
    list.appendChild(card);
  });
}

function renderInsights(insights) {
  document.getElementById("statTotalFoods").textContent = insights.totalFoods || 0;
  document.getElementById("statTotalQuantity").textContent = insights.totalQuantity || 0;
  document.getElementById("statLowStock").textContent = insights.lowStockCount || 0;
  document.getElementById("statRecent").textContent = insights.recentCount || 0;
  document.getElementById("statDonorHistory").textContent = state.foodsHistory.length || 0;
  document.getElementById("statNgoHistory").textContent = state.requestsHistory.length || 0;

  const locationInsights = document.getElementById("locationInsights");
  const categoryInsights = document.getElementById("categoryInsights");
  const foodHistoryList = document.getElementById("foodHistoryList");

  locationInsights.innerHTML = "";
  categoryInsights.innerHTML = "";
  foodHistoryList.innerHTML = "";

  const locations = insights.byLocation || [];
  const categories = insights.byCategory || [];

  if (!locations.length) {
    locationInsights.innerHTML = "<li>No location data yet.</li>";
  } else {
    locations.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item._id}: ${item.quantity} units (${item.items} listings)`;
      locationInsights.appendChild(li);
    });
  }

  if (!categories.length) {
    categoryInsights.innerHTML = "<li>No category data yet.</li>";
  } else {
    categories.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item._id}: ${item.items} listings`;
      categoryInsights.appendChild(li);
    });
  }

  if (!state.foodsHistory.length) {
    foodHistoryList.innerHTML = "<li>No food history yet.</li>";
  } else {
    state.foodsHistory.slice(0, 20).forEach((food) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${food.foodName || "Food"} ${food.category || "mixed"} ${food.location || "Unknown"} | Qty: ${food.quantity ?? "-"}</strong>
        <div class="muted">Contact: ${food.contactName || "-"} | ${food.contactNumber || "-"}</div>
      `;
      foodHistoryList.appendChild(li);
    });
  }
}

async function loadFoods() {
  const list = document.getElementById("foodList");
  if (list) {
    list.innerHTML = `<article class="item"><p class="muted">Loading food feed...</p></article>`;
  }

  try {
    const foods = await api(`/foods${buildFoodQuery()}`);
    const safeFoods = Array.isArray(foods) ? foods : [];
    state.foodsHistory = safeFoods;
    renderFoods(safeFoods);
    const donorHistory = document.getElementById("statDonorHistory");
    if (donorHistory) donorHistory.textContent = state.foodsHistory.length || 0;
  } catch (err) {
    if (list) {
      list.innerHTML = `<article class="item"><p class="muted">Unable to load feed right now.</p></article>`;
    }
    state.foodsHistory = [];
    showToast(err.message);
  }
}

async function loadRequests() {
  if (!state.token) {
    state.requestsHistory = [];
    const ngoHistory = document.getElementById("statNgoHistory");
    if (ngoHistory) ngoHistory.textContent = 0;
    renderRequests([]);
    return;
  }

  try {
    const requests = await api("/requests");
    state.requestsHistory = Array.isArray(requests) ? requests : [];
    const ngoHistory = document.getElementById("statNgoHistory");
    if (ngoHistory) ngoHistory.textContent = state.requestsHistory.length || 0;
    renderRequests(requests);
  } catch (err) {
    state.requestsHistory = [];
    showToast(err.message);
  }
}

async function loadInsights() {
  if (!state.token) {
    renderInsights({
      totalFoods: 0,
      totalQuantity: 0,
      lowStockCount: 0,
      recentCount: 0,
      byLocation: [],
      byCategory: []
    });
    return;
  }

  try {
    const insights = await api("/foods/insights");
    renderInsights(insights);
  } catch (err) {
    showToast(err.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  setFormBusy("loginForm", true, "Logging in...");
  setAuthMessage("");

  try {
    const data = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    applySession(username, data.token, data.role);
    resetFeedFilters();
    await Promise.all([loadFoods(), loadRequests(), loadInsights()]);
    showToast(`Logged in as ${data.role}`);
    setAuthMessage(`Login successful. Welcome ${username}.`);
    setActiveModule("feedModule");
  } catch (err) {
    clearSession();
    renderRequests([]);
    await loadInsights();
    setAuthMessage(`Login failed: ${err.message}`, true);
    showToast(`Login failed: ${err.message}`);
  } finally {
    setFormBusy("loginForm", false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;
  const role = document.getElementById("registerRole").value;
  setFormBusy("registerForm", true, "Registering...");
  setAuthMessage("");

  try {
    await api("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role })
    });

    // Auto-login after register so role switches immediately.
    const loginData = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    applySession(username, loginData.token, loginData.role);
    resetFeedFilters();
    await Promise.all([loadFoods(), loadRequests(), loadInsights()]);
    showToast(`Registered and logged in as ${loginData.role}`);
    setAuthMessage(`Registered successfully as ${loginData.role}.`);
    event.target.reset();
    setActiveModule("feedModule");
  } catch (err) {
    setAuthMessage(`Register failed: ${err.message}`, true);
    showToast(err.message);
  } finally {
    setFormBusy("registerForm", false);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const username = document.getElementById("forgotUsername").value.trim();
  const newPassword = document.getElementById("forgotNewPassword").value;
  setFormBusy("forgotPasswordForm", true, "Resetting...");
  setAuthMessage("");

  try {
    const data = await api("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, newPassword })
    });
    showToast(data.message || "Password reset successful");
    setAuthMessage(data.message || "Password reset successful");
    event.target.reset();
  } catch (err) {
    setAuthMessage(`Reset failed: ${err.message}`, true);
    showToast(err.message);
  } finally {
    setFormBusy("forgotPasswordForm", false);
  }
}

async function handleAddFood(event) {
  event.preventDefault();
  const foodName = document.getElementById("foodName").value.trim();
  const quantity = document.getElementById("quantity").value;
  const location = document.getElementById("location").value.trim();
  const contactName = document.getElementById("contactName").value.trim();
  const contactNumber = document.getElementById("contactNumber").value.trim();
  const category = document.getElementById("category").value;

  try {
    const data = await api("/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodName, quantity, location, contactName, contactNumber, category })
    });
    showToast(data.message || "Food listed");
    event.target.reset();
    await Promise.all([loadFoods(), loadInsights()]);
    setActiveModule("feedModule");
  } catch (err) {
    showToast(err.message);
  }
}

async function handleRequestListClick(event) {
  const action = event.target.dataset.action;
  const requestId = event.target.dataset.requestId;
  if (!action || !requestId) return;

  try {
    if (action === "approve") {
      await api(`/requests/${requestId}/approve`, { method: "PUT" });
      showToast("Request approved");
    }
    if (action === "reject") {
      await api(`/requests/${requestId}/reject`, { method: "PUT" });
      showToast("Request rejected");
    }
    await loadRequests();
  } catch (err) {
    showToast(err.message);
  }
}

async function handleFoodListClick(event) {
  const actionButton = event.target.closest("button[data-action][data-food-id]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;
  const foodId = actionButton.dataset.foodId;
  if (!action || !foodId) return;

  try {
    if (action === "request") {
      if (state.role !== "ngo") {
        showToast("Only NGO can request pickup");
        return;
      }
      const data = await api("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId })
      });
      showToast(data.message || "Request sent");
      await loadRequests();
      setActiveModule("requestModule");
      return;
    }

    if (action === "delete-food") {
      if (!confirm("Delete this food listing?")) {
        return;
      }
      const data = await api(`/foods/${foodId}`, { method: "DELETE" });
      showToast(data.message || "Food deleted");
      await Promise.all([loadFoods(), loadInsights()]);
    }
  } catch (err) {
    showToast(err.message);
  }
}

function handleLogout() {
  clearSession();
  resetFeedFilters();
  renderRequests([]);
  loadInsights().catch(() => {});
  setActiveModule("accessModule");
  showToast("Logged out");
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  setTimeout(() => {
    window.location.replace(cleanUrl);
    setTimeout(() => window.location.reload(), 120);
  }, 200);
}

function wireEvents() {
  const bind = (id, event, handler) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(event, handler);
    }
  };

  wireModuleNavigation();
  bind("loginForm", "submit", handleLogin);
  bind("registerForm", "submit", handleRegister);
  bind("forgotPasswordForm", "submit", handleForgotPassword);
  bind("addFoodForm", "submit", handleAddFood);
  bind("filterForm", "submit", async (event) => {
    event.preventDefault();
    await loadFoods();
  });
  bind("logoutBtn", "click", handleLogout);
  bind("requestList", "click", handleRequestListClick);
  bind("foodList", "click", handleFoodListClick);
}

document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();
  clearSession();
  setActiveModule("accessModule");
  await checkApi();
  setAuthUI();
  checkLocalSetupHint();
  await loadFoods();
  await loadRequests();
  await loadInsights();
});
