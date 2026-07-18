/**
 * AgendaSimples — aplicação de agendamentos (demo de portfólio)
 * Dados persistidos apenas em localStorage no navegador.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "agendaSimples_v1";
  const BUSINESS_HOURS = { start: 8, end: 20 }; // 08:00–20:00
  const SLOT_STEP = 15; // minutes for free-slot suggestions

  const STATUS = {
    agendado: { label: "Agendado", class: "badge-agendado" },
    confirmado: { label: "Confirmado", class: "badge-confirmado" },
    concluido: { label: "Concluído", class: "badge-concluido" },
    cancelado: { label: "Cancelado", class: "badge-cancelado" },
    nao_compareceu: { label: "Não compareceu", class: "badge-nao_compareceu" },
  };

  const ACTIVE_STATUSES = ["agendado", "confirmado"];

  const VIEW_META = {
    dashboard: { title: "Dashboard", subtitle: "Visão geral do seu negócio" },
    agenda: { title: "Agenda", subtitle: "Visualize e organize seus atendimentos" },
    appointments: { title: "Agendamentos", subtitle: "Lista completa e ações rápidas" },
    clients: { title: "Clientes", subtitle: "Cadastro e histórico de atendimentos" },
    services: { title: "Serviços", subtitle: "Catálogo com duração e preços" },
  };

  // ─── State ───────────────────────────────────────────────────────────────
  let state = {
    clients: [],
    services: [],
    appointments: [],
  };

  let ui = {
    view: "dashboard",
    agendaMode: "day",
    agendaDate: startOfDay(new Date()),
    filters: {
      clientId: "",
      serviceId: "",
      status: "",
      date: "",
    },
    apptFilters: { status: "", from: "", to: "", search: "" },
    clientSearch: "",
    openModal: null,
    confirmCallback: null,
    actionsApptId: null,
    clientDetailId: null,
    lastFocused: null,
  };

  // ─── Utils ───────────────────────────────────────────────────────────────
  function uid() {
    return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toDateInput(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }

  function parseDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function formatDateBR(d) {
    const x = new Date(d);
    return x.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateShort(d) {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatTime(d) {
    const x = new Date(d);
    return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }

  function formatCurrency(v) {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDuration(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  function weekStart(d) {
    const x = startOfDay(d);
    const day = x.getDay(); // 0 Sun
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    return addDays(x, diff);
  }

  function endOfRange(start, durationMin) {
    return new Date(start.getTime() + durationMin * 60000);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function initials(name) {
    const parts = String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
    return parts || "?";
  }

  function normalizeClient(c) {
    if (!c || typeof c !== "object" || !c.id) return null;
    const name = String(c.name || "").trim();
    if (!name) return null;
    return {
      id: String(c.id),
      name,
      phone: String(c.phone || "").trim(),
      email: String(c.email || "").trim(),
      notes: typeof c.notes === "string" ? c.notes : "",
    };
  }

  function normalizeService(s) {
    if (!s || typeof s !== "object" || !s.id) return null;
    const name = String(s.name || "").trim();
    if (!name) return null;
    const duration = Math.max(5, Math.min(480, Number(s.duration) || 30));
    const price = Math.max(0, Number(s.price) || 0);
    return {
      id: String(s.id),
      name,
      duration,
      price,
      description: typeof s.description === "string" ? s.description : "",
    };
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ─── Storage ─────────────────────────────────────────────────────────────
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Aceita estado vazio válido (arrays vazios) — não reseeds no reload
      if (!data || !Array.isArray(data.clients) || !Array.isArray(data.services) || !Array.isArray(data.appointments)) {
        return null;
      }
      return {
        clients: data.clients.map(normalizeClient).filter(Boolean),
        services: data.services.map(normalizeService).filter(Boolean),
        appointments: data.appointments.map(normalizeAppointment).filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  function normalizeAppointment(a) {
    if (!a || typeof a !== "object" || !a.id || !a.start) return null;
    const duration = Math.max(5, Math.min(480, Number(a.duration) || 30));
    const price = Math.max(0, Number(a.price) || 0);
    const status = STATUS[a.status] ? a.status : "agendado";
    const start = new Date(a.start);
    if (Number.isNaN(start.getTime())) return null;
    return {
      id: String(a.id),
      clientId: a.clientId || "",
      serviceId: a.serviceId || "",
      start: start.toISOString(),
      duration,
      price,
      status,
      notes: typeof a.notes === "string" ? a.notes : "",
      createdAt: a.createdAt || start.toISOString(),
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast("Não foi possível salvar os dados neste navegador.", "error");
    }
  }

  // ─── Seed data ───────────────────────────────────────────────────────────
  function buildSeed() {
    const clients = [
      {
        id: "c1",
        name: "Ana Paula Mendes",
        phone: "(11) 98765-4321",
        email: "ana.mendes@email.com",
        notes: "Prefere horário da manhã. Cabelo colorido — usar produtos sem sulfato.",
      },
      {
        id: "c2",
        name: "Bruno Oliveira",
        phone: "(11) 97654-3210",
        email: "bruno.oliveira@email.com",
        notes: "Barba densa. Alérgico a fragrâncias fortes.",
      },
      {
        id: "c3",
        name: "Camila Rocha",
        phone: "(11) 96543-2109",
        email: "camila.rocha@email.com",
        notes: "Primeira vez no consultório. Indicação de amiga.",
      },
      {
        id: "c4",
        name: "Diego Santos",
        phone: "(11) 95432-1098",
        email: "diego.santos@email.com",
        notes: "Treina 3x por semana. Foco em hipertrofia.",
      },
      {
        id: "c5",
        name: "Fernanda Lima",
        phone: "(11) 94321-0987",
        email: "fernanda.lima@email.com",
        notes: "Pele sensível. Evitar ácidos fortes.",
      },
      {
        id: "c6",
        name: "Gustavo Nogueira",
        phone: "(11) 93210-9876",
        email: "",
        notes: "Cliente recorrente de corte social.",
      },
      {
        id: "c7",
        name: "Helena Costa",
        phone: "(11) 92109-8765",
        email: "helena.costa@email.com",
        notes: "Aulas particulares de inglês — nível intermediário.",
      },
      {
        id: "c8",
        name: "Igor Martins",
        phone: "(11) 91098-7654",
        email: "igor.martins@email.com",
        notes: "Consulta de retorno.",
      },
    ];

    const services = [
      {
        id: "s1",
        name: "Corte masculino",
        duration: 40,
        price: 55,
        description: "Corte com máquina e tesoura, finalização e recomendação de estilo.",
      },
      {
        id: "s2",
        name: "Barba completa",
        duration: 30,
        price: 40,
        description: "Aparar, desenhar contorno e hidratação da barba.",
      },
      {
        id: "s3",
        name: "Corte + barba",
        duration: 60,
        price: 85,
        description: "Combo completo de corte e barba com finalização.",
      },
      {
        id: "s4",
        name: "Limpeza de pele",
        duration: 50,
        price: 120,
        description: "Higienização, esfoliação e máscara facial.",
      },
      {
        id: "s5",
        name: "Personal training",
        duration: 60,
        price: 100,
        description: "Sessão individual de treino com foco nos objetivos do aluno.",
      },
      {
        id: "s6",
        name: "Aula particular",
        duration: 50,
        price: 90,
        description: "Aula individual de 50 minutos com material de apoio.",
      },
      {
        id: "s7",
        name: "Consulta",
        duration: 40,
        price: 180,
        description: "Consulta presencial com avaliação e plano de acompanhamento.",
      },
    ];

    const today = startOfDay(new Date());
    const y = (offset, time, clientId, serviceId, status, notes = "") => {
      const svc = services.find((s) => s.id === serviceId);
      const date = addDays(today, offset);
      const [hh, mm] = time.split(":").map(Number);
      const start = new Date(date);
      start.setHours(hh, mm, 0, 0);
      return {
        id: uid(),
        clientId,
        serviceId,
        start: start.toISOString(),
        duration: svc.duration,
        price: svc.price,
        status,
        notes,
        createdAt: new Date().toISOString(),
      };
    };

    const appointments = [
      y(0, "09:00", "c1", "s4", "confirmado", "Retorno da limpeza anterior."),
      y(0, "10:00", "c2", "s3", "agendado", ""),
      y(0, "11:30", "c6", "s1", "confirmado", ""),
      y(0, "14:00", "c4", "s5", "agendado", "Treino de peito e tríceps."),
      y(0, "16:00", "c7", "s6", "confirmado", "Revisão de present perfect."),
      y(0, "17:30", "c8", "s7", "agendado", ""),
      y(-1, "10:00", "c3", "s4", "concluido", "Cliente satisfeita."),
      y(-1, "15:00", "c5", "s4", "nao_compareceu", "Não avisou com antecedência."),
      y(-2, "09:30", "c2", "s2", "concluido", ""),
      y(-2, "11:00", "c1", "s1", "cancelado", "Remarcou para a próxima semana."),
      y(1, "09:00", "c5", "s4", "agendado", ""),
      y(1, "11:00", "c6", "s3", "confirmado", ""),
      y(1, "14:30", "c4", "s5", "agendado", "Treino de pernas."),
      y(2, "10:00", "c7", "s6", "agendado", ""),
      y(2, "15:00", "c3", "s7", "confirmado", "Primeira consulta."),
      y(3, "09:30", "c1", "s4", "agendado", ""),
      y(3, "16:00", "c2", "s1", "agendado", ""),
      y(4, "10:00", "c8", "s7", "agendado", ""),
      y(-3, "14:00", "c4", "s5", "concluido", ""),
      y(-4, "11:00", "c6", "s1", "concluido", ""),
    ];

    return { clients, services, appointments };
  }

  function restoreSeed() {
    state = buildSeed();
    saveState();
    toast("Dados fictícios restaurados com sucesso.", "success");
    renderAll();
  }

  // ─── Lookups ─────────────────────────────────────────────────────────────
  function getClient(id) {
    return state.clients.find((c) => c.id === id) || null;
  }
  function getService(id) {
    return state.services.find((s) => s.id === id) || null;
  }
  function getAppointment(id) {
    return state.appointments.find((a) => a.id === id) || null;
  }

  function apptStart(a) {
    return new Date(a.start);
  }
  function apptEnd(a) {
    return endOfRange(apptStart(a), a.duration);
  }

  // ─── Conflict detection ──────────────────────────────────────────────────
  function findConflicts(start, duration, excludeId) {
    const dur = Number(duration);
    if (!start || Number.isNaN(start.getTime()) || !dur || dur < 5) return [];
    const end = endOfRange(start, dur);
    const exclude = excludeId ? String(excludeId) : null;
    return state.appointments.filter((a) => {
      if (exclude && String(a.id) === exclude) return false;
      if (!ACTIVE_STATUSES.includes(a.status)) return false;
      return rangesOverlap(start, end, apptStart(a), apptEnd(a));
    });
  }

  function describeConflict(conflicts, start, duration) {
    const end = endOfRange(start, duration);
    const parts = conflicts.map((c) => {
      const client = getClient(c.clientId);
      const service = getService(c.serviceId);
      return `• ${formatTime(apptStart(c))}–${formatTime(apptEnd(c))} — ${client?.name || "Cliente"} (${service?.name || "serviço"}, ${STATUS[c.status]?.label || c.status})`;
    });
    return (
      `O horário ${formatTime(start)}–${formatTime(end)} se sobrepõe a ${conflicts.length} agendamento(s) ativo(s):\n` +
      parts.join("\n")
    );
  }

  function suggestFreeSlots(date, duration, excludeId, max = 5) {
    const day = startOfDay(date);
    const free = [];
    const dayStart = new Date(day);
    dayStart.setHours(BUSINESS_HOURS.start, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(BUSINESS_HOURS.end, 0, 0, 0);
    const requested = date.getTime();
    const dur = Number(duration) || 30;

    const busy = state.appointments
      .filter((a) => {
        if (excludeId && String(a.id) === String(excludeId)) return false;
        if (!ACTIVE_STATUSES.includes(a.status)) return false;
        const s = apptStart(a);
        return startOfDay(s).getTime() === day.getTime();
      })
      .map((a) => ({ start: apptStart(a), end: apptEnd(a) }))
      .sort((a, b) => a.start - b.start);

    let cursor = new Date(dayStart);
    while (cursor.getTime() + dur * 60000 <= dayEnd.getTime()) {
      const slotEnd = endOfRange(cursor, dur);
      const hits = busy.some((b) => rangesOverlap(cursor, slotEnd, b.start, b.end));
      if (!hits) {
        free.push(new Date(cursor));
        // avança sem pular janelas adjacentes de 15 min para achar slots próximos
        cursor = new Date(cursor.getTime() + SLOT_STEP * 60000);
      } else {
        cursor = new Date(cursor.getTime() + SLOT_STEP * 60000);
      }
    }

    // Prioriza horários mais próximos do horário solicitado
    free.sort((a, b) => {
      const da = Math.abs(a.getTime() - requested);
      const db = Math.abs(b.getTime() - requested);
      if (da !== db) return da - db;
      return a.getTime() - b.getTime();
    });

    // Remove slots muito próximos entre si (mesmo bloco visual)
    const picked = [];
    for (const slot of free) {
      if (picked.length >= max) break;
      const tooClose = picked.some((p) => Math.abs(p.getTime() - slot.getTime()) < 15 * 60000);
      if (!tooClose) picked.push(slot);
    }
    return picked;
  }

  // ─── Toast ───────────────────────────────────────────────────────────────
  function toast(message, type = "info") {
    const container = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", "status");
    el.innerHTML = `
      <span class="toast-msg">${escapeHtml(message)}</span>
      <button type="button" class="toast-close btn-icon" aria-label="Fechar notificação">×</button>
    `;
    const remove = () => {
      el.remove();
    };
    el.querySelector(".toast-close").addEventListener("click", remove);
    container.appendChild(el);
    setTimeout(remove, 4200);
  }

  // ─── Modal helpers ───────────────────────────────────────────────────────
  const FOCUSABLE_SEL =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusable(container) {
    return [...container.querySelectorAll(FOCUSABLE_SEL)].filter((el) => {
      if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      return el.getClientRects().length > 0;
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    // Confirmação empilha sobre o modal atual; demais modais substituem o anterior
    if (id !== "confirm-modal") {
      document.querySelectorAll(".modal-backdrop").forEach((m) => {
        if (m.id === id) return;
        if (m.id === "confirm-modal") ui.confirmCallback = null;
        m.hidden = true;
      });
      ui.lastFocused = document.activeElement;
    } else if (!ui.openModal) {
      ui.lastFocused = document.activeElement;
    }

    modal.hidden = false;
    document.body.classList.add("modal-open");
    ui.openModal = id;
    const focusable = getFocusable(modal);
    if (focusable[0]) focusable[0].focus();
  }

  function closeModal(id) {
    const modal = document.getElementById(id || ui.openModal);
    if (!modal) return;
    if (modal.id === "confirm-modal") {
      // Cancela ação pendente se fechar sem confirmar
      ui.confirmCallback = null;
    }
    modal.hidden = true;
    if (id === ui.openModal || !id || modal.id === ui.openModal) ui.openModal = null;
    // Se ainda houver outro modal aberto, restaura o foco nele
    const stillOpen = document.querySelector(".modal-backdrop:not([hidden])");
    if (stillOpen) {
      ui.openModal = stillOpen.id;
      document.body.classList.add("modal-open");
      const focusable = getFocusable(stillOpen);
      if (focusable[0]) focusable[0].focus();
    } else {
      document.body.classList.remove("modal-open");
      if (ui.lastFocused && typeof ui.lastFocused.focus === "function") {
        try {
          ui.lastFocused.focus();
        } catch {
          /* ignore */
        }
      }
    }
  }

  function trapFocus(e) {
    if (e.key !== "Tab" || !ui.openModal) return;
    const modal = document.getElementById(ui.openModal);
    if (!modal || modal.hidden) return;
    const nodes = getFocusable(modal);
    if (!nodes.length) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!modal.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function confirmDialog(title, message, onConfirm, dangerLabel = "Confirmar") {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    const ok = document.getElementById("confirm-ok");
    ok.textContent = dangerLabel;
    ok.className = "btn btn-danger";
    ui.confirmCallback = onConfirm;
    openModal("confirm-modal");
  }

  // ─── Navigation ──────────────────────────────────────────────────────────
  function setView(view) {
    ui.view = view;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach((sec) => {
      const is = sec.id === `view-${view}`;
      sec.hidden = !is;
      sec.classList.toggle("active", is);
    });
    const meta = VIEW_META[view];
    document.getElementById("page-title").textContent = meta.title;
    document.getElementById("page-subtitle").textContent = meta.subtitle;
    closeSidebar();
    renderCurrentView();
  }

  function openSidebar() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebar-overlay").hidden = false;
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "true");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").hidden = true;
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
    document.body.classList.remove("sidebar-open");
  }

  // ─── Populate selects ────────────────────────────────────────────────────
  function fillClientSelects() {
    const sorted = state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const filterOptions =
      `<option value="">Todos</option>` +
      sorted.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    const filter = document.getElementById("filter-client");
    filter.innerHTML = filterOptions;
    // Sincroniza filtro inválido (ex.: cliente excluído)
    if (ui.filters.clientId && !state.clients.some((c) => c.id === ui.filters.clientId)) {
      ui.filters.clientId = "";
    }
    filter.value = ui.filters.clientId || "";

    const appt = document.getElementById("appt-client");
    const apptVal = appt.value;
    appt.innerHTML =
      `<option value="">Selecione…</option>` +
      sorted.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if (apptVal && state.clients.some((c) => c.id === apptVal)) appt.value = apptVal;
    else appt.value = "";
  }

  function fillServiceSelects() {
    const sorted = state.services.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const filterOptions =
      `<option value="">Todos</option>` +
      sorted.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    const filter = document.getElementById("filter-service");
    filter.innerHTML = filterOptions;
    if (ui.filters.serviceId && !state.services.some((s) => s.id === ui.filters.serviceId)) {
      ui.filters.serviceId = "";
    }
    filter.value = ui.filters.serviceId || "";

    const appt = document.getElementById("appt-service");
    const apptVal = appt.value;
    appt.innerHTML =
      `<option value="">Selecione…</option>` +
      sorted
        .map(
          (s) =>
            `<option value="${s.id}" data-duration="${s.duration}" data-price="${s.price}">${escapeHtml(s.name)} (${formatDuration(s.duration)} · ${formatCurrency(s.price)})</option>`
        )
        .join("");
    if (apptVal && state.services.some((s) => s.id === apptVal)) appt.value = apptVal;
    else appt.value = "";
  }

  // ─── Filters helpers ─────────────────────────────────────────────────────
  function appointmentPassesAgendaFilters(a, options = {}) {
    const f = ui.filters;
    if (f.clientId && a.clientId !== f.clientId) return false;
    if (f.serviceId && a.serviceId !== f.serviceId) return false;
    if (f.status && a.status !== f.status) return false;
    // Filtro de data vale só na lista (rótulo "Data (lista)"); dia/semana usam a navegação
    const applyDate = options.applyDateFilter === true;
    if (applyDate && f.date) {
      const d = toDateInput(apptStart(a));
      if (d !== f.date) return false;
    }
    return true;
  }

  function appointmentPassesListFilters(a) {
    const f = ui.apptFilters;
    if (f.status && a.status !== f.status) return false;
    if (f.from) {
      if (toDateInput(apptStart(a)) < f.from) return false;
    }
    if (f.to) {
      if (toDateInput(apptStart(a)) > f.to) return false;
    }
    if (f.search) {
      const q = f.search.toLowerCase();
      const client = getClient(a.clientId);
      const service = getService(a.serviceId);
      const hay = `${client?.name || ""} ${service?.name || ""} ${a.notes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────
  function renderDashboard() {
    const today = startOfDay(new Date());
    const todayTs = today.getTime();
    const now = new Date();

    const todayAppts = state.appointments
      .filter((a) => startOfDay(apptStart(a)).getTime() === todayTs)
      .sort((a, b) => apptStart(a) - apptStart(b));

    const upcoming = state.appointments
      .filter((a) => ACTIVE_STATUSES.includes(a.status) && apptStart(a) >= now)
      .sort((a, b) => apptStart(a) - apptStart(b))
      .slice(0, 6);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const monthAppts = state.appointments.filter((a) => {
      const s = apptStart(a);
      return s >= monthStart && s <= monthEnd;
    });

    const revenue = monthAppts
      .filter((a) => a.status === "concluido" || ACTIVE_STATUSES.includes(a.status))
      .filter((a) => a.status !== "cancelado" && a.status !== "nao_compareceu")
      .reduce((sum, a) => sum + Number(a.price || 0), 0);

    const concluded = monthAppts.filter((a) => a.status === "concluido").length;
    const cancelled = monthAppts.filter((a) => a.status === "cancelado").length;
    const noShow = monthAppts.filter((a) => a.status === "nao_compareceu").length;
    const todayActive = todayAppts.filter((a) => a.status !== "cancelado").length;

    const stats = [
      { label: "Hoje", value: String(todayActive), hint: "atendimentos no dia", accent: "accent-primary" },
      { label: "Clientes", value: String(state.clients.length), hint: "cadastrados", accent: "" },
      {
        label: "Faturamento previsto",
        value: formatCurrency(revenue),
        hint: "mês atual (ativos + concluídos)",
        accent: "accent-success",
      },
      { label: "Concluídos", value: String(concluded), hint: "neste mês", accent: "accent-success" },
      { label: "Cancelados", value: String(cancelled), hint: "neste mês", accent: "accent-muted" },
      { label: "Não compareceram", value: String(noShow), hint: "neste mês", accent: "accent-warning" },
    ];

    document.getElementById("stats-grid").innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card ${s.accent}" role="listitem">
        <span class="stat-label">${escapeHtml(s.label)}</span>
        <span class="stat-value">${escapeHtml(s.value)}</span>
        <span class="stat-hint">${escapeHtml(s.hint)}</span>
      </div>`
      )
      .join("");

    document.getElementById("today-list").innerHTML = renderApptList(todayAppts, "Nenhum agendamento para hoje.");
    document.getElementById("upcoming-list").innerHTML = renderApptList(
      upcoming,
      "Nenhum próximo atendimento agendado."
    );
  }

  function renderApptList(list, emptyMsg) {
    if (!list.length) {
      return emptyState(emptyMsg, "Crie um agendamento para começar.", true);
    }
    return `<div class="list">${list.map((a) => apptListItem(a)).join("")}</div>`;
  }

  function apptListItem(a) {
    const client = getClient(a.clientId);
    const service = getService(a.serviceId);
    const start = apptStart(a);
    return `
      <div class="list-item">
        <div class="list-item-time">${formatTime(start)}</div>
        <div class="list-item-body">
          <p class="list-item-title">${escapeHtml(client?.name || "—")}</p>
          <p class="list-item-meta">${escapeHtml(service?.name || "—")} · ${formatDateShort(start)} · ${formatDuration(a.duration)} · ${formatCurrency(a.price)}</p>
          <span class="badge ${STATUS[a.status]?.class || ""}">${STATUS[a.status]?.label || a.status}</span>
        </div>
        <div class="list-item-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-actions="${a.id}">Ações</button>
        </div>
      </div>`;
  }

  function emptyState(title, desc, showNewAppt) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 2v3M13 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(desc || "")}</p>
        ${showNewAppt ? `<button type="button" class="btn btn-primary btn-sm" data-open-new-appt>Novo agendamento</button>` : ""}
      </div>`;
  }

  // ─── Agenda ──────────────────────────────────────────────────────────────
  function renderAgenda() {
    fillClientSelects();
    fillServiceSelects();
    updateAgendaLabel();

    document.getElementById("agenda-day-view").hidden = ui.agendaMode !== "day";
    document.getElementById("agenda-week-view").hidden = ui.agendaMode !== "week";
    document.getElementById("agenda-list-view").hidden = ui.agendaMode !== "list";

    document.querySelectorAll("[data-agenda-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.agendaMode === ui.agendaMode);
    });

    if (ui.agendaMode === "day") renderDayView();
    else if (ui.agendaMode === "week") renderWeekView();
    else renderAgendaList();
  }

  function updateAgendaLabel() {
    const el = document.getElementById("agenda-date-label");
    if (ui.agendaMode === "week") {
      const start = weekStart(ui.agendaDate);
      const end = addDays(start, 6);
      el.textContent = `${formatDateShort(start)} – ${formatDateShort(end)}`;
    } else {
      el.textContent = formatDateBR(ui.agendaDate);
    }
  }

  function renderDayView() {
    const day = startOfDay(ui.agendaDate);
    const dayTs = day.getTime();
    const appts = state.appointments
      .filter((a) => startOfDay(apptStart(a)).getTime() === dayTs)
      .filter((a) => appointmentPassesAgendaFilters(a, { applyDateFilter: false }));

    const container = document.getElementById("agenda-day-view");
    const hours = [];
    for (let h = BUSINESS_HOURS.start; h < BUSINESS_HOURS.end; h++) hours.push(h);

    const hourH = 56;
    const totalH = hours.length * hourH;
    const dayStartMin = BUSINESS_HOURS.start * 60;
    const now = new Date();
    const isToday = startOfDay(now).getTime() === dayTs;

    let nowTop = null;
    if (isToday) {
      const mins = now.getHours() * 60 + now.getMinutes();
      if (mins >= dayStartMin && mins < BUSINESS_HOURS.end * 60) {
        nowTop = ((mins - dayStartMin) / 60) * hourH;
      }
    }

    // Layout em colunas quando horários se sobrepõem (inclui cancelados no dia)
    const layout = appts
      .map((a) => {
        const s = apptStart(a);
        const startMin = s.getHours() * 60 + s.getMinutes();
        const top = ((startMin - dayStartMin) / 60) * hourH;
        const height = Math.max((a.duration / 60) * hourH, 32);
        return {
          a,
          s,
          top,
          height,
          startMs: s.getTime(),
          endMs: apptEnd(a).getTime(),
          col: 0,
          cols: 1,
        };
      })
      .filter((x) => x.top + x.height >= 0 && x.top <= totalH)
      .sort((x, y) => x.startMs - y.startMs || y.endMs - x.endMs);

    layout.forEach((item, i) => {
      const used = new Set();
      for (let j = 0; j < i; j++) {
        const other = layout[j];
        if (item.startMs < other.endMs && other.startMs < item.endMs) {
          used.add(other.col);
        }
      }
      let col = 0;
      while (used.has(col)) col++;
      item.col = col;
    });
    layout.forEach((item) => {
      let maxCol = item.col;
      layout.forEach((other) => {
        if (item.startMs < other.endMs && other.startMs < item.endMs) {
          maxCol = Math.max(maxCol, other.col);
        }
      });
      item.cols = maxCol + 1;
    });

    const blocks = layout
      .map((item) => {
        const { a, s, top, height, col, cols } = item;
        const widthPct = 100 / cols;
        const leftPct = col * widthPct;
        const client = getClient(a.clientId);
        const service = getService(a.serviceId);
        return `
          <button type="button" class="appt-block status-${a.status}" data-actions="${a.id}"
            style="top:${Math.max(0, top)}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);right:auto;position:absolute"
            aria-label="${escapeHtml(client?.name || "")} às ${formatTime(s)}, ${STATUS[a.status]?.label || a.status}">
            <strong>${escapeHtml(client?.name || "—")}</strong>
            <span class="appt-sub">${formatTime(s)}–${formatTime(apptEnd(a))} · ${escapeHtml(service?.name || "")}</span>
          </button>`;
      })
      .join("");

    let html = `
      <div class="agenda-day-header">
        <h2>${formatDateBR(day)}</h2>
        <span class="badge badge-confirmado">${appts.filter((a) => a.status !== "cancelado").length} na agenda</span>
      </div>
      <div class="day-timeline" aria-label="Horários do dia">
        <div class="day-timeline-inner" style="position:relative;display:grid;grid-template-columns:56px 1fr;min-height:${totalH}px">
          <div class="day-hours" aria-hidden="true">
            ${hours
              .map(
                (h) =>
                  `<div class="hour-label" style="height:${hourH}px;border-bottom:1px solid var(--border)">${pad(h)}:00</div>`
              )
              .join("")}
          </div>
          <div class="day-track" style="position:relative;height:${totalH}px;border-left:1px solid var(--border)">
            ${hours
              .map(
                () =>
                  `<div style="height:${hourH}px;border-bottom:1px solid var(--border);pointer-events:none"></div>`
              )
              .join("")}
            ${nowTop !== null ? `<div class="now-marker" style="top:${nowTop}px" aria-hidden="true"></div>` : ""}
            ${blocks}
          </div>
        </div>
      </div>`;

    container.innerHTML = html;
  }

  function renderWeekView() {
    const start = weekStart(ui.agendaDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const todayTs = startOfDay(new Date()).getTime();
    const hours = [];
    for (let h = BUSINESS_HOURS.start; h < BUSINESS_HOURS.end; h++) hours.push(h);

    const weekAppts = state.appointments.filter((a) => {
      const d = startOfDay(apptStart(a)).getTime();
      return d >= start.getTime() && d <= addDays(start, 6).getTime();
    }).filter((a) => appointmentPassesAgendaFilters(a, { applyDateFilter: false }));

    const dow = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

    let html = `<div class="week-grid">`;
    html += `<div class="week-corner week-head"></div>`;
    days.forEach((d, i) => {
      const isToday = startOfDay(d).getTime() === todayTs;
      html += `<div class="week-head${isToday ? " today" : ""}">
        <span class="dow">${dow[i]}</span>
        ${pad(d.getDate())}/${pad(d.getMonth() + 1)}
      </div>`;
    });

    hours.forEach((h) => {
      html += `<div class="week-hour-label">${pad(h)}:00</div>`;
      days.forEach((d) => {
        const dayTs = startOfDay(d).getTime();
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const cellAppts = weekAppts.filter((a) => {
          const s = apptStart(a);
          return startOfDay(s).getTime() === dayTs && s.getHours() === h;
        });
        html += `<div class="week-cell${weekend ? " weekend" : ""}">`;
        cellAppts.forEach((a) => {
          const client = getClient(a.clientId);
          html += `<button type="button" class="appt-block status-${a.status}" data-actions="${a.id}"
            aria-label="${escapeHtml(client?.name || "")} às ${formatTime(apptStart(a))}">
            <strong>${formatTime(apptStart(a))} ${escapeHtml((client?.name || "").split(" ")[0])}</strong>
          </button>`;
        });
        html += `</div>`;
      });
    });

    html += `</div>`;
    document.getElementById("agenda-week-view").innerHTML = html;
  }

  function renderAgendaList() {
    let list = state.appointments
      .slice()
      .filter((a) => appointmentPassesAgendaFilters(a, { applyDateFilter: true }));
    if (!ui.filters.date) {
      // Sem data explícita: a partir do dia selecionado na navegação
      const from = startOfDay(ui.agendaDate);
      list = list.filter((a) => apptStart(a) >= from);
    }
    list.sort((a, b) => apptStart(a) - apptStart(b));
    list = list.slice(0, 50);

    document.getElementById("agenda-list-body").innerHTML = list.length
      ? `<div class="list">${list.map((a) => apptListItem(a)).join("")}</div>`
      : emptyState("Nenhum atendimento encontrado", "Ajuste os filtros ou crie um novo agendamento.", true);
  }

  // ─── Appointments table ──────────────────────────────────────────────────
  function renderAppointments() {
    let list = state.appointments.slice().filter(appointmentPassesListFilters);
    list.sort((a, b) => apptStart(b) - apptStart(a));

    const tbody = document.getElementById("appointments-tbody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7">${emptyState("Nenhum agendamento", "Altere os filtros ou crie um novo.", true)}</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((a) => {
        const client = getClient(a.clientId);
        const service = getService(a.serviceId);
        const s = apptStart(a);
        return `<tr>
          <td>
            <div class="mono">${formatDateShort(s)}</div>
            <div class="mono" style="color:var(--primary);font-weight:600">${formatTime(s)}–${formatTime(apptEnd(a))}</div>
          </td>
          <td><strong>${escapeHtml(client?.name || "—")}</strong></td>
          <td>${escapeHtml(service?.name || "—")}</td>
          <td>${formatDuration(a.duration)}</td>
          <td class="mono">${formatCurrency(a.price)}</td>
          <td><span class="badge ${STATUS[a.status]?.class || ""}">${STATUS[a.status]?.label || a.status}</span></td>
          <td class="cell-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-actions="${a.id}">Ações</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  // ─── Clients ─────────────────────────────────────────────────────────────
  function renderClients() {
    const q = ui.clientSearch.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    let list = state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (q) {
      list = list.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const phoneMatch = digits && c.phone.replace(/\D/g, "").includes(digits);
        const phoneText = c.phone.toLowerCase().includes(q);
        return nameMatch || phoneMatch || phoneText;
      });
    }

    const container = document.getElementById("clients-list");
    if (!list.length) {
      container.innerHTML = emptyState(
        q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado",
        q ? "Tente outro nome ou telefone." : "Cadastre seu primeiro cliente.",
        false
      );
      if (!q) {
        container.innerHTML += `<div style="text-align:center;margin-top:-1rem"><button type="button" class="btn btn-primary btn-sm" id="empty-new-client">Novo cliente</button></div>`;
        document.getElementById("empty-new-client")?.addEventListener("click", () => openClientForm());
      }
      return;
    }

    container.innerHTML = list
      .map((c) => {
        const count = state.appointments.filter((a) => a.clientId === c.id).length;
        return `
        <article class="client-card">
          <div class="client-card-header">
            <div class="avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</div>
            <div>
              <h3>${escapeHtml(c.name)}</h3>
              <p class="contact">${escapeHtml(c.phone)}${c.email ? " · " + escapeHtml(c.email) : ""}</p>
            </div>
          </div>
          ${c.notes ? `<p class="notes-preview">${escapeHtml(c.notes)}</p>` : ""}
          <p class="list-item-meta" style="margin:0">${count} agendamento(s) no histórico</p>
          <div class="client-card-footer">
            <button type="button" class="btn btn-ghost btn-sm" data-client-view="${c.id}">Histórico</button>
            <button type="button" class="btn btn-ghost btn-sm" data-client-edit="${c.id}">Editar</button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-client-delete="${c.id}">Excluir</button>
            <button type="button" class="btn btn-secondary btn-sm" data-client-schedule="${c.id}">Agendar</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function openClientForm(client) {
    clearFieldErrors("client");
    document.getElementById("client-modal-title").textContent = client ? "Editar cliente" : "Novo cliente";
    document.getElementById("client-id").value = client?.id || "";
    document.getElementById("client-name").value = client?.name || "";
    document.getElementById("client-phone").value = client?.phone || "";
    document.getElementById("client-email").value = client?.email || "";
    document.getElementById("client-notes").value = client?.notes || "";
    openModal("client-modal");
  }

  function saveClient(e) {
    e.preventDefault();
    clearFieldErrors("client");
    const id = document.getElementById("client-id").value;
    const name = document.getElementById("client-name").value.trim();
    const phone = document.getElementById("client-phone").value.trim();
    const email = document.getElementById("client-email").value.trim();
    const notes = document.getElementById("client-notes").value.trim();
    let ok = true;
    if (!name) {
      setFieldError("client-name", "Informe o nome do cliente.");
      ok = false;
    }
    if (!phone) {
      setFieldError("client-phone", "Informe o telefone.");
      ok = false;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("client-email", "E-mail inválido.");
      ok = false;
    }
    if (!ok) return;

    if (id) {
      const c = getClient(id);
      if (c) {
        c.name = name;
        c.phone = phone;
        c.email = email;
        c.notes = notes;
      }
      toast("Cliente atualizado.", "success");
    } else {
      state.clients.push({ id: uid(), name, phone, email, notes });
      toast("Cliente cadastrado.", "success");
    }
    saveState();
    closeModal("client-modal");
    fillClientSelects();
    renderAll();
  }

  function deleteClient(id) {
    const c = getClient(id);
    if (!c) return;
    const linked = state.appointments.filter((a) => a.clientId === id).length;
    const msg =
      linked > 0
        ? `Excluir ${c.name}? Também serão removidos ${linked} agendamento(s) vinculados. Esta ação não pode ser desfeita.`
        : `Excluir o cliente ${c.name}? Esta ação não pode ser desfeita.`;
    confirmDialog("Excluir cliente", msg, () => {
      state.clients = state.clients.filter((x) => x.id !== id);
      state.appointments = state.appointments.filter((a) => a.clientId !== id);
      if (ui.filters.clientId === id) ui.filters.clientId = "";
      if (ui.clientDetailId === id) {
        ui.clientDetailId = null;
        closeModal("client-detail-modal");
      }
      saveState();
      toast(
        linked > 0
          ? `Cliente excluído. ${linked} agendamento(s) removido(s).`
          : "Cliente excluído.",
        "success"
      );
      closeModal("confirm-modal");
      renderAll();
    }, "Excluir");
  }

  function showClientDetail(id) {
    const c = getClient(id);
    if (!c) return;
    ui.clientDetailId = id;
    document.getElementById("client-detail-title").textContent = c.name;
    document.getElementById("client-detail-info").innerHTML = `
      <dl>
        <div class="detail-row"><dt>Telefone</dt><dd>${escapeHtml(c.phone)}</dd></div>
        <div class="detail-row"><dt>E-mail</dt><dd>${escapeHtml(c.email || "—")}</dd></div>
        <div class="detail-row"><dt>Observações</dt><dd>${escapeHtml(c.notes || "—")}</dd></div>
      </dl>`;
    const history = state.appointments
      .filter((a) => a.clientId === id)
      .sort((a, b) => apptStart(b) - apptStart(a));
    document.getElementById("client-detail-history").innerHTML = history.length
      ? `<div class="list">${history.map((a) => apptListItem(a)).join("")}</div>`
      : emptyState("Sem agendamentos", "Este cliente ainda não tem histórico.", false);
    openModal("client-detail-modal");
  }

  // ─── Services ────────────────────────────────────────────────────────────
  function renderServices() {
    const container = document.getElementById("services-list");
    const list = state.services.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!list.length) {
      container.innerHTML =
        emptyState("Nenhum serviço cadastrado", "Cadastre os serviços que você oferece.", false) +
        `<div style="text-align:center"><button type="button" class="btn btn-primary btn-sm" id="empty-new-service">Novo serviço</button></div>`;
      document.getElementById("empty-new-service")?.addEventListener("click", () => openServiceForm());
      return;
    }
    container.innerHTML = list
      .map(
        (s) => `
      <article class="service-card">
        <h3>${escapeHtml(s.name)}</h3>
        <div class="service-meta">
          <span class="chip">${formatDuration(s.duration)}</span>
          <span class="chip chip-price">${formatCurrency(s.price)}</span>
        </div>
        <p>${escapeHtml(s.description || "Sem descrição.")}</p>
        <div class="service-card-footer">
          <button type="button" class="btn btn-ghost btn-sm" data-service-edit="${s.id}">Editar</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-service-delete="${s.id}">Excluir</button>
        </div>
      </article>`
      )
      .join("");
  }

  function openServiceForm(service) {
    clearFieldErrors("service");
    document.getElementById("service-modal-title").textContent = service ? "Editar serviço" : "Novo serviço";
    document.getElementById("service-id").value = service?.id || "";
    document.getElementById("service-name").value = service?.name || "";
    document.getElementById("service-duration").value = service?.duration ?? 30;
    document.getElementById("service-price").value = service?.price ?? 0;
    document.getElementById("service-description").value = service?.description || "";
    openModal("service-modal");
  }

  function saveService(e) {
    e.preventDefault();
    clearFieldErrors("service");
    const id = document.getElementById("service-id").value;
    const name = document.getElementById("service-name").value.trim();
    const duration = Number(document.getElementById("service-duration").value);
    const price = Number(document.getElementById("service-price").value);
    const description = document.getElementById("service-description").value.trim();
    let ok = true;
    if (!name) {
      setFieldError("service-name", "Informe o nome do serviço.");
      ok = false;
    }
    if (!duration || duration < 5) {
      setFieldError("service-duration", "Duração mínima de 5 minutos.");
      ok = false;
    } else if (duration > 480) {
      setFieldError("service-duration", "Duração máxima de 480 minutos.");
      ok = false;
    }
    if (Number.isNaN(price) || price < 0) {
      setFieldError("service-price", "Informe um preço válido.");
      ok = false;
    }
    if (!ok) return;

    const safeDuration = Math.max(5, Math.min(480, Math.round(duration)));
    const safePrice = Math.max(0, price);

    if (id) {
      const s = getService(id);
      if (s) {
        s.name = name;
        s.duration = safeDuration;
        s.price = safePrice;
        s.description = description;
      }
      toast("Serviço atualizado.", "success");
    } else {
      state.services.push({ id: uid(), name, duration: safeDuration, price: safePrice, description });
      toast("Serviço cadastrado.", "success");
    }
    saveState();
    closeModal("service-modal");
    fillServiceSelects();
    renderAll();
  }

  function deleteService(id) {
    const s = getService(id);
    if (!s) return;
    const linked = state.appointments.filter((a) => a.serviceId === id);
    const activeLinked = linked.filter((a) => ACTIVE_STATUSES.includes(a.status));
    if (linked.length > 0) {
      const detail =
        activeLinked.length > 0
          ? `Há ${linked.length} agendamento(s) com este serviço (${activeLinked.length} ativo(s)). Exclua ou altere esses agendamentos antes.`
          : `Há ${linked.length} agendamento(s) no histórico com este serviço. Exclua-os ou altere o serviço neles antes de remover o cadastro.`;
      toast(detail, "error");
      return;
    }
    confirmDialog("Excluir serviço", `Excluir o serviço “${s.name}”? Esta ação não pode ser desfeita.`, () => {
      state.services = state.services.filter((x) => x.id !== id);
      if (ui.filters.serviceId === id) ui.filters.serviceId = "";
      saveState();
      toast("Serviço excluído.", "success");
      closeModal("confirm-modal");
      fillServiceSelects();
      renderAll();
    }, "Excluir");
  }

  // ─── Appointments form ───────────────────────────────────────────────────
  function openAppointmentForm(appt, presets = {}) {
    if (!appt) {
      if (!state.clients.length) {
        toast("Cadastre pelo menos um cliente antes de agendar.", "error");
        setView("clients");
        return;
      }
      if (!state.services.length) {
        toast("Cadastre pelo menos um serviço antes de agendar.", "error");
        setView("services");
        return;
      }
    }

    clearFieldErrors("appt");
    hideConflict();
    setSubmitEnabled(true);
    fillClientSelects();
    fillServiceSelects();

    const isEdit = Boolean(appt);
    document.getElementById("appointment-modal-title").textContent = isEdit
      ? presets.reschedule
        ? "Remarcar agendamento"
        : "Editar agendamento"
      : "Novo agendamento";
    document.getElementById("appt-submit").textContent = isEdit ? "Salvar alterações" : "Salvar agendamento";

    document.getElementById("appt-id").value = appt?.id || "";
    document.getElementById("appt-client").value = appt?.clientId || presets.clientId || "";
    document.getElementById("appt-service").value = appt?.serviceId || presets.serviceId || "";

    if (appt) {
      const s = apptStart(appt);
      document.getElementById("appt-date").value = toDateInput(s);
      document.getElementById("appt-time").value = formatTime(s);
      document.getElementById("appt-duration").value = appt.duration;
      document.getElementById("appt-price").value = appt.price;
      document.getElementById("appt-status").value = appt.status;
      document.getElementById("appt-notes").value = appt.notes || "";
    } else {
      const d = presets.date || ui.agendaDate;
      let duration = 30;
      let price = 0;
      const presetServiceId = presets.serviceId || "";
      if (presetServiceId) {
        const svc = getService(presetServiceId);
        if (svc) {
          duration = svc.duration;
          price = svc.price;
        }
      }
      document.getElementById("appt-date").value = toDateInput(d);
      document.getElementById("appt-duration").value = duration;
      document.getElementById("appt-price").value = price;
      document.getElementById("appt-status").value = "agendado";
      document.getElementById("appt-notes").value = "";

      // Preferir horário livre: evita abrir o formulário já bloqueado por conflito
      if (presets.time) {
        document.getElementById("appt-time").value = presets.time;
      } else {
        const preferred = parseDateTime(toDateInput(d), "09:00");
        const free = suggestFreeSlots(preferred, duration, null, 1);
        const slot = free[0] || preferred;
        document.getElementById("appt-date").value = toDateInput(slot);
        document.getElementById("appt-time").value = formatTime(slot);
      }
    }

    if (presets.reschedule) {
      document.getElementById("appt-status").value = appt?.status === "cancelado" ? "agendado" : appt?.status || "agendado";
    }

    openModal("appointment-modal");
    checkConflictsLive();
  }

  function applyServiceDefaults() {
    const sel = document.getElementById("appt-service");
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) return;
    const duration = opt.dataset.duration;
    const price = opt.dataset.price;
    if (duration) document.getElementById("appt-duration").value = duration;
    if (price) document.getElementById("appt-price").value = price;
    checkConflictsLive();
  }

  function setSubmitEnabled(enabled) {
    const btn = document.getElementById("appt-submit");
    if (btn) btn.disabled = !enabled;
  }

  function hideConflict() {
    const box = document.getElementById("conflict-box");
    box.hidden = true;
    document.getElementById("conflict-message").textContent = "";
    document.getElementById("conflict-suggestions").innerHTML = "";
    setSubmitEnabled(true);
  }

  function showConflict(conflicts, start, duration, excludeId) {
    const box = document.getElementById("conflict-box");
    box.hidden = false;
    document.getElementById("conflict-message").textContent = describeConflict(conflicts, start, duration);
    const suggestions = suggestFreeSlots(start, duration, excludeId, 5);
    const wrap = document.getElementById("conflict-suggestions");
    if (!suggestions.length) {
      wrap.innerHTML = `<p class="suggestions-empty">Não há horários livres neste dia no expediente (${pad(BUSINESS_HOURS.start)}:00–${pad(BUSINESS_HOURS.end)}:00). Tente outra data.</p>`;
    } else {
      wrap.innerHTML =
        `<span class="suggestions-label">Horários livres próximos:</span>` +
        suggestions
          .map(
            (s) =>
              `<button type="button" class="suggestion-btn" data-suggest-time="${formatTime(s)}" data-suggest-date="${toDateInput(s)}">${formatTime(s)}</button>`
          )
          .join("");
    }
    setSubmitEnabled(false);
  }

  function checkConflictsLive() {
    const date = document.getElementById("appt-date").value;
    const time = document.getElementById("appt-time").value;
    const duration = Number(document.getElementById("appt-duration").value);
    const status = document.getElementById("appt-status").value;
    const id = document.getElementById("appt-id").value || null;

    if (!date || !time || !duration || duration < 5) {
      hideConflict();
      return null;
    }

    // Status que não ocupam a agenda não geram conflito
    if (!ACTIVE_STATUSES.includes(status)) {
      hideConflict();
      return null;
    }

    const start = parseDateTime(date, time);
    if (Number.isNaN(start.getTime())) {
      hideConflict();
      return null;
    }

    const conflicts = findConflicts(start, duration, id);
    if (conflicts.length) {
      showConflict(conflicts, start, duration, id);
      return conflicts;
    }
    hideConflict();
    return null;
  }

  function saveAppointment(e) {
    e.preventDefault();
    clearFieldErrors("appt");
    const id = document.getElementById("appt-id").value;
    const clientId = document.getElementById("appt-client").value;
    const serviceId = document.getElementById("appt-service").value;
    const date = document.getElementById("appt-date").value;
    const time = document.getElementById("appt-time").value;
    const duration = Math.round(Number(document.getElementById("appt-duration").value));
    const price = Number(document.getElementById("appt-price").value);
    const status = document.getElementById("appt-status").value;
    const notes = document.getElementById("appt-notes").value.trim();

    let ok = true;
    if (!clientId || !getClient(clientId)) {
      setFieldError("appt-client", "Selecione um cliente válido.");
      ok = false;
    }
    if (!serviceId || !getService(serviceId)) {
      setFieldError("appt-service", "Selecione um serviço válido.");
      ok = false;
    }
    if (!date) {
      setFieldError("appt-date", "Informe a data.");
      ok = false;
    }
    if (!time) {
      setFieldError("appt-time", "Informe o horário.");
      ok = false;
    }
    if (!duration || duration < 5) {
      setFieldError("appt-duration", "Duração mínima de 5 minutos.");
      ok = false;
    } else if (duration > 480) {
      setFieldError("appt-duration", "Duração máxima de 480 minutos.");
      ok = false;
    }
    if (Number.isNaN(price) || price < 0) {
      setFieldError("appt-price", "Informe um preço válido.");
      ok = false;
    }
    if (!STATUS[status]) {
      toast("Status inválido.", "error");
      ok = false;
    }
    if (!ok) return;

    const safeDuration = Math.max(5, Math.min(480, duration));
    const safePrice = Math.max(0, price);
    const start = parseDateTime(date, time);
    if (Number.isNaN(start.getTime())) {
      setFieldError("appt-date", "Data ou horário inválidos.");
      return;
    }

    // Revalida conflito no submit (mesmo se o botão foi reabilitado via DOM)
    if (ACTIVE_STATUSES.includes(status)) {
      const conflicts = findConflicts(start, safeDuration, id || null);
      if (conflicts.length) {
        showConflict(conflicts, start, safeDuration, id || null);
        toast("Não é possível salvar: há conflito de horário.", "error");
        return;
      }
    }

    if (id) {
      const a = getAppointment(id);
      if (!a) {
        toast("Agendamento não encontrado. Atualize a página.", "error");
        closeModal("appointment-modal");
        renderAll();
        return;
      }
      a.clientId = clientId;
      a.serviceId = serviceId;
      a.start = start.toISOString();
      a.duration = safeDuration;
      a.price = safePrice;
      a.status = status;
      a.notes = notes;
      toast("Agendamento atualizado.", "success");
    } else {
      state.appointments.push({
        id: uid(),
        clientId,
        serviceId,
        start: start.toISOString(),
        duration: safeDuration,
        price: safePrice,
        status,
        notes,
        createdAt: new Date().toISOString(),
      });
      toast("Agendamento criado.", "success");
    }
    saveState();
    closeModal("appointment-modal");
    renderAll();
  }

  // ─── Actions menu ────────────────────────────────────────────────────────
  function openActions(id) {
    const a = getAppointment(id);
    if (!a) return;
    ui.actionsApptId = id;
    const client = getClient(a.clientId);
    const service = getService(a.serviceId);
    const s = apptStart(a);
    document.getElementById("actions-summary").innerHTML = `
      <strong>${escapeHtml(client?.name || "—")}</strong>
      ${escapeHtml(service?.name || "—")}<br>
      ${formatDateShort(s)} · ${formatTime(s)}–${formatTime(apptEnd(a))} · ${formatCurrency(a.price)}<br>
      <span class="badge ${STATUS[a.status]?.class || ""}" style="margin-top:0.35rem">${STATUS[a.status]?.label || a.status}</span>
    `;

    const actions = [];
    actions.push({ id: "edit", label: "Editar", class: "btn btn-secondary" });
    actions.push({ id: "reschedule", label: "Remarcar", class: "btn btn-secondary" });
    if (a.status === "agendado") {
      actions.push({ id: "confirm", label: "Confirmar", class: "btn btn-primary" });
    }
    if (ACTIVE_STATUSES.includes(a.status)) {
      actions.push({ id: "complete", label: "Concluir", class: "btn btn-primary" });
      actions.push({ id: "noshow", label: "Não compareceu", class: "btn btn-secondary" });
      actions.push({ id: "cancel", label: "Cancelar", class: "btn btn-secondary" });
    }
    if (a.status === "cancelado") {
      actions.push({ id: "reopen", label: "Reabrir como agendado", class: "btn btn-secondary" });
    }
    actions.push({ id: "delete", label: "Excluir", class: "btn btn-danger" });

    document.getElementById("actions-list").innerHTML = actions
      .map((act) => `<button type="button" class="${act.class}" data-action-do="${act.id}">${act.label}</button>`)
      .join("");

    openModal("actions-modal");
  }

  function runAction(actionId) {
    const a = getAppointment(ui.actionsApptId);
    if (!a) return;

    if (actionId === "edit") {
      closeModal("actions-modal");
      openAppointmentForm(a);
      return;
    }
    if (actionId === "reschedule") {
      closeModal("actions-modal");
      openAppointmentForm(a, { reschedule: true });
      return;
    }
    if (actionId === "confirm") {
      a.status = "confirmado";
      saveState();
      toast("Agendamento confirmado.", "success");
      closeModal("actions-modal");
      renderAll();
      return;
    }
    if (actionId === "complete") {
      a.status = "concluido";
      saveState();
      toast("Atendimento marcado como concluído. Horário liberado na agenda.", "success");
      closeModal("actions-modal");
      renderAll();
      return;
    }
    if (actionId === "noshow") {
      a.status = "nao_compareceu";
      saveState();
      toast("Marcado como não compareceu. Horário liberado na agenda.", "info");
      closeModal("actions-modal");
      renderAll();
      return;
    }
    if (actionId === "cancel") {
      const apptId = a.id;
      closeModal("actions-modal");
      confirmDialog(
        "Cancelar agendamento",
        "Deseja cancelar este agendamento? O horário ficará livre para novos atendimentos.",
        () => {
          const target = getAppointment(apptId);
          if (!target) {
            toast("Agendamento não encontrado.", "error");
            closeModal("confirm-modal");
            renderAll();
            return;
          }
          target.status = "cancelado";
          saveState();
          toast("Agendamento cancelado. Horário liberado.", "success");
          closeModal("confirm-modal");
          renderAll();
        },
        "Cancelar agendamento"
      );
      return;
    }
    if (actionId === "reopen") {
      const conflicts = findConflicts(apptStart(a), a.duration, a.id);
      if (conflicts.length) {
        toast("Não é possível reabrir: o horário conflita com outro agendamento ativo.", "error");
        return;
      }
      a.status = "agendado";
      saveState();
      toast("Agendamento reaberto.", "success");
      closeModal("actions-modal");
      renderAll();
      return;
    }
    if (actionId === "delete") {
      const apptId = a.id;
      closeModal("actions-modal");
      confirmDialog(
        "Excluir agendamento",
        "Excluir permanentemente este agendamento? Esta ação não pode ser desfeita.",
        () => {
          state.appointments = state.appointments.filter((x) => x.id !== apptId);
          saveState();
          toast("Agendamento excluído.", "success");
          closeModal("confirm-modal");
          renderAll();
        },
        "Excluir"
      );
    }
  }

  // ─── Field errors ────────────────────────────────────────────────────────
  function setFieldError(inputId, msg) {
    const input = document.getElementById(inputId);
    const err = document.getElementById("err-" + inputId);
    input?.closest(".field")?.classList.add("invalid");
    if (err) err.textContent = msg;
  }

  function clearFieldErrors(prefix) {
    const map = {
      client: ["client-name", "client-phone", "client-email"],
      service: ["service-name", "service-duration", "service-price"],
      appt: ["appt-client", "appt-service", "appt-date", "appt-time", "appt-duration", "appt-price"],
    };
    (map[prefix] || []).forEach((id) => {
      document.getElementById(id)?.closest(".field")?.classList.remove("invalid");
      const err = document.getElementById("err-" + id);
      if (err) err.textContent = "";
    });
  }

  // ─── Render orchestration ────────────────────────────────────────────────
  function renderCurrentView() {
    if (ui.view === "dashboard") renderDashboard();
    else if (ui.view === "agenda") renderAgenda();
    else if (ui.view === "appointments") renderAppointments();
    else if (ui.view === "clients") renderClients();
    else if (ui.view === "services") renderServices();
  }

  function renderAll() {
    fillClientSelects();
    fillServiceSelects();
    renderCurrentView();
  }

  // ─── Event binding ───────────────────────────────────────────────────────
  function bindEvents() {
    // Nav
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.goto));
    });

    document.getElementById("menu-toggle").addEventListener("click", openSidebar);
    document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
    document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);

    // Seed
    document.getElementById("btn-seed-data").addEventListener("click", () => {
      confirmDialog(
        "Restaurar dados fictícios",
        "Isso substitui todos os clientes, serviços e agendamentos atuais pelos dados de demonstração. Continuar?",
        () => {
          closeModal("confirm-modal");
          restoreSeed();
        },
        "Restaurar"
      );
    });

    // New appointment
    document.getElementById("btn-new-appointment").addEventListener("click", () => openAppointmentForm());
    document.getElementById("btn-new-appointment-page").addEventListener("click", () => openAppointmentForm());

    // Forms
    document.getElementById("appointment-form").addEventListener("submit", saveAppointment);
    document.getElementById("client-form").addEventListener("submit", saveClient);
    document.getElementById("service-form").addEventListener("submit", saveService);

    document.getElementById("appt-service").addEventListener("change", applyServiceDefaults);
    ["appt-date", "appt-time", "appt-duration", "appt-status"].forEach((id) => {
      document.getElementById(id).addEventListener("change", checkConflictsLive);
      document.getElementById(id).addEventListener("input", checkConflictsLive);
    });

    document.getElementById("btn-new-client").addEventListener("click", () => openClientForm());
    document.getElementById("btn-new-service").addEventListener("click", () => openServiceForm());

    document.getElementById("client-detail-edit").addEventListener("click", () => {
      const c = getClient(ui.clientDetailId);
      closeModal("client-detail-modal");
      if (c) openClientForm(c);
    });

    document.getElementById("confirm-ok").addEventListener("click", () => {
      // Snapshot: closeModal limpa o callback ao fechar o modal de confirmação
      const cb = ui.confirmCallback;
      ui.confirmCallback = null;
      if (typeof cb === "function") cb();
    });

    // Close modals
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const backdrop = btn.closest(".modal-backdrop");
        if (backdrop) closeModal(backdrop.id);
      });
    });
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    // Escape, focus trap e fechamento do menu mobile
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (ui.openModal) {
          closeModal(ui.openModal);
          return;
        }
        if (document.getElementById("sidebar").classList.contains("open")) {
          closeSidebar();
        }
        return;
      }
      trapFocus(e);
    });

    // Agenda controls
    document.querySelectorAll("[data-agenda-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.agendaMode = btn.dataset.agendaMode;
        renderAgenda();
      });
    });
    document.getElementById("agenda-prev").addEventListener("click", () => {
      ui.agendaDate = addDays(ui.agendaDate, ui.agendaMode === "week" ? -7 : -1);
      renderAgenda();
    });
    document.getElementById("agenda-next").addEventListener("click", () => {
      ui.agendaDate = addDays(ui.agendaDate, ui.agendaMode === "week" ? 7 : 1);
      renderAgenda();
    });
    document.getElementById("agenda-today").addEventListener("click", () => {
      ui.agendaDate = startOfDay(new Date());
      renderAgenda();
    });

    document.getElementById("filter-client").addEventListener("change", (e) => {
      ui.filters.clientId = e.target.value;
      renderAgenda();
    });
    document.getElementById("filter-service").addEventListener("change", (e) => {
      ui.filters.serviceId = e.target.value;
      renderAgenda();
    });
    document.getElementById("filter-status").addEventListener("change", (e) => {
      ui.filters.status = e.target.value;
      renderAgenda();
    });
    document.getElementById("filter-date").addEventListener("change", (e) => {
      ui.filters.date = e.target.value;
      if (e.target.value) ui.agendaDate = parseDateTime(e.target.value, "00:00");
      renderAgenda();
    });
    document.getElementById("clear-filters").addEventListener("click", () => {
      ui.filters = { clientId: "", serviceId: "", status: "", date: "" };
      document.getElementById("filter-client").value = "";
      document.getElementById("filter-service").value = "";
      document.getElementById("filter-status").value = "";
      document.getElementById("filter-date").value = "";
      renderAgenda();
    });

    // Appointments filters
    document.getElementById("appt-filter-status").addEventListener("change", (e) => {
      ui.apptFilters.status = e.target.value;
      renderAppointments();
    });
    document.getElementById("appt-filter-from").addEventListener("change", (e) => {
      ui.apptFilters.from = e.target.value;
      renderAppointments();
    });
    document.getElementById("appt-filter-to").addEventListener("change", (e) => {
      ui.apptFilters.to = e.target.value;
      renderAppointments();
    });
    document.getElementById("search-appointments").addEventListener(
      "input",
      debounce((e) => {
        ui.apptFilters.search = e.target.value;
        renderAppointments();
      }, 200)
    );

    document.getElementById("search-clients").addEventListener(
      "input",
      debounce((e) => {
        ui.clientSearch = e.target.value;
        renderClients();
      }, 200)
    );

    // Delegated clicks
    document.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-actions]");
      if (t) {
        openActions(t.dataset.actions);
        return;
      }
      const openNew = e.target.closest("[data-open-new-appt]");
      if (openNew) {
        openAppointmentForm();
        return;
      }
      const ce = e.target.closest("[data-client-edit]");
      if (ce) {
        openClientForm(getClient(ce.dataset.clientEdit));
        return;
      }
      const cv = e.target.closest("[data-client-view]");
      if (cv) {
        showClientDetail(cv.dataset.clientView);
        return;
      }
      const cd = e.target.closest("[data-client-delete]");
      if (cd) {
        deleteClient(cd.dataset.clientDelete);
        return;
      }
      const cs = e.target.closest("[data-client-schedule]");
      if (cs) {
        openAppointmentForm(null, { clientId: cs.dataset.clientSchedule });
        return;
      }
      const se = e.target.closest("[data-service-edit]");
      if (se) {
        openServiceForm(getService(se.dataset.serviceEdit));
        return;
      }
      const sd = e.target.closest("[data-service-delete]");
      if (sd) {
        deleteService(sd.dataset.serviceDelete);
        return;
      }
      const act = e.target.closest("[data-action-do]");
      if (act) {
        runAction(act.dataset.actionDo);
        return;
      }
      const sug = e.target.closest("[data-suggest-time]");
      if (sug) {
        document.getElementById("appt-time").value = sug.dataset.suggestTime;
        if (sug.dataset.suggestDate) document.getElementById("appt-date").value = sug.dataset.suggestDate;
        checkConflictsLive();
        toast("Horário sugerido aplicado. Revise e salve.", "info");
      }
    });
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    const loaded = loadState();
    if (loaded) {
      // Preserva inclusive estado vazio (usuário limpou tudo)
      state = {
        clients: loaded.clients,
        services: loaded.services,
        appointments: loaded.appointments,
      };
    } else {
      state = buildSeed();
      saveState();
    }
    bindEvents();
    setView("dashboard");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
