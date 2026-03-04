const API_BASE = "https://food-waste-backend-3.onrender.com";

function normalizeToken(token) {
  if (!token) return "";
  return String(token).replace(/^"+|"+$/g, "").trim();
}

const state = {
  token: normalizeToken(localStorage.getItem("token")),
  role: localStorage.getItem("role") || "",
  username: ""
};

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
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
  localStorage.setItem("token", normalizedToken);
  localStorage.setItem("role", roleValue);
  setAuthUI();
}

function clearSession() {
  state.token = "";
  state.role = "";
  state.username = "";
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  setAuthUI();
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeader()
    }
  });
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

  document.getElementById("roleBadge").textContent = roleText;
  document.getElementById("authState").textContent = authText;
  document.getElementById("addFoodPanel").style.display =
    state.role === "admin" || state.role === "donor" ? "block" : "none";
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
  return params.toString() ? `?${params.toString()}` : "";
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

  const locationInsights = document.getElementById("locationInsights");
  const categoryInsights = document.getElementById("categoryInsights");

  locationInsights.innerHTML = "";
  categoryInsights.innerHTML = "";

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
}

async function loadFoods() {
  try {
    const foods = await api(`/foods${buildFoodQuery()}`);
    renderFoods(foods);
  } catch (err) {
    showToast(err.message);
  }
}

async function loadRequests() {
  if (!state.token) {
    renderRequests([]);
    return;
  }

  try {
    const requests = await api("/requests");
    renderRequests(requests);
  } catch (err) {
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

  try {
    const data = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    applySession(username, data.token, data.role);
    await Promise.all([loadFoods(), loadRequests(), loadInsights()]);
    showToast(`Logged in as ${data.role}`);
  } catch (err) {
    clearSession();
    renderRequests([]);
    await loadInsights();
    showToast(`Login failed: ${err.message}`);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;
  const role = document.getElementById("registerRole").value;

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
    await Promise.all([loadFoods(), loadRequests(), loadInsights()]);
    showToast(`Registered and logged in as ${loginData.role}`);
    event.target.reset();
  } catch (err) {
    showToast(err.message);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const username = document.getElementById("forgotUsername").value.trim();
  const newPassword = document.getElementById("forgotNewPassword").value;

  try {
    const data = await api("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, newPassword })
    });
    showToast(data.message || "Password reset successful");
    event.target.reset();
  } catch (err) {
    showToast(err.message);
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
  const action = event.target.dataset.action;
  const foodId = event.target.dataset.foodId;
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
  renderRequests([]);
  loadInsights();
  showToast("Logged out");
}

function wireEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("registerForm").addEventListener("submit", handleRegister);
  document.getElementById("forgotPasswordForm").addEventListener("submit", handleForgotPassword);
  document.getElementById("addFoodForm").addEventListener("submit", handleAddFood);
  document.getElementById("filterForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadFoods();
  });
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("requestList").addEventListener("click", handleRequestListClick);
  document.getElementById("foodList").addEventListener("click", handleFoodListClick);
}

document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();
  await checkApi();
  setAuthUI();
  checkLocalSetupHint();
  await loadFoods();
  await loadRequests();
  await loadInsights();
});
