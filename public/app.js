const state = {
  students: [],
  courses: [],
  records: [],
  filteredRecords: [],
  authenticated: false,
  editingStudentId: "",
  editingCourseId: "",
  expandedLists: {
    studentCourses: false,
    courses: false,
    students: false,
    recentRecords: false,
    records: false
  }
};

const LIST_LIMIT = 10;

const els = {
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  loginForm: document.querySelector("#loginForm"),
  loginMessage: document.querySelector("#loginMessage"),
  currentUser: document.querySelector("#currentUser"),
  logoutBtn: document.querySelector("#logoutBtn"),
  totalStudents: document.querySelector("#totalStudents"),
  presentToday: document.querySelector("#presentToday"),
  absentToday: document.querySelector("#absentToday"),
  studentsTable: document.querySelector("#studentsTable"),
  coursesTable: document.querySelector("#coursesTable"),
  recordsList: document.querySelector("#recordsList"),
  recordsTable: document.querySelector("#recordsTable"),
  studentCoursesToggle: document.querySelector("#studentCoursesToggle"),
  coursesToggle: document.querySelector("#coursesToggle"),
  studentsToggle: document.querySelector("#studentsToggle"),
  recentRecordsToggle: document.querySelector("#recentRecordsToggle"),
  recordsToggle: document.querySelector("#recordsToggle"),
  studentForm: document.querySelector("#studentForm"),
  studentCourses: document.querySelector("#studentCourses"),
  studentSubmitBtn: document.querySelector("#studentSubmitBtn"),
  cancelStudentEditBtn: document.querySelector("#cancelStudentEditBtn"),
  courseForm: document.querySelector("#courseForm"),
  courseSubmitBtn: document.querySelector("#courseSubmitBtn"),
  cancelCourseEditBtn: document.querySelector("#cancelCourseEditBtn"),
  courseMessage: document.querySelector("#courseMessage"),
  attendanceForm: document.querySelector("#attendanceForm"),
  attendanceCourseSelect: document.querySelector("#attendanceCourseSelect"),
  studentSelect: document.querySelector("#studentSelect"),
  attendanceMessage: document.querySelector("#attendanceMessage"),
  formMessage: document.querySelector("#formMessage"),
  refreshBtn: document.querySelector("#refreshBtn"),
  filterForm: document.querySelector("#filterForm"),
  departmentFilter: document.querySelector("#departmentFilter"),
  courseFilter: document.querySelector("#courseFilter"),
  filterSummary: document.querySelector("#filterSummary"),
  clearFiltersBtn: document.querySelector("#clearFiltersBtn"),
  printBtn: document.querySelector("#printBtn")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function normalizeCourseIds(courseIds) {
  return Array.isArray(courseIds) ? courseIds : [];
}

function getCourseName(courseId) {
  const course = state.courses.find((item) => item.id === courseId);
  return course ? course.name : courseId;
}

function getVisibleItems(key, items) {
  return state.expandedLists[key] ? items : items.slice(0, LIST_LIMIT);
}

function renderListToggle(element, key, total, label) {
  if (!element) return;

  if (total <= LIST_LIMIT) {
    element.innerHTML = "";
    return;
  }

  const isExpanded = state.expandedLists[key];
  const hiddenCount = total - LIST_LIMIT;
  element.innerHTML = `
    <button class="secondary small-button" type="button" data-toggle-list="${escapeHtml(key)}">
      ${isExpanded ? "Show less" : `Show ${hiddenCount} more`}
    </button>
    <span>${isExpanded ? `Showing all ${total} ${label}.` : `Showing ${LIST_LIMIT} of ${total} ${label}.`}</span>
  `;
}

function showLogin(message = "") {
  state.authenticated = false;
  els.loginView.hidden = false;
  els.dashboardView.hidden = true;
  els.loginMessage.textContent = message;
  els.loginForm.username.focus();
}

function showDashboard(username) {
  state.authenticated = true;
  els.loginView.hidden = true;
  els.dashboardView.hidden = false;
  els.currentUser.textContent = username ? `Signed in as ${username}` : "";
}

function getFilterParams() {
  const params = new URLSearchParams();
  const formData = new FormData(els.filterForm);

  for (const [key, value] of formData.entries()) {
    const cleanValue = String(value).trim();
    if (cleanValue) params.set(key, cleanValue);
  }

  return params;
}

function buildStudentPayload(form) {
  const formData = new FormData(form);
  return {
    id: String(formData.get("id") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    level: String(formData.get("level") || "").trim(),
    fingerprintId: String(formData.get("fingerprintId") || "").trim(),
    contact: String(formData.get("contact") || "").trim(),
    courseIds: formData.getAll("courseIds")
  };
}

function buildCoursePayload(form) {
  const formData = new FormData(form);
  return {
    id: String(formData.get("id") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    semester: String(formData.get("semester") || "").trim()
  };
}

function resetStudentForm() {
  state.editingStudentId = "";
  els.studentForm.reset();
  els.studentForm.elements.id.disabled = false;
  els.studentSubmitBtn.textContent = "Add Student";
  els.cancelStudentEditBtn.hidden = true;
  renderStudentCourseOptions();
}

function resetCourseForm() {
  state.editingCourseId = "";
  els.courseForm.reset();
  els.courseForm.elements.id.disabled = false;
  els.courseSubmitBtn.textContent = "Add Course";
  els.cancelCourseEditBtn.hidden = true;
}

function renderDepartmentFilter() {
  const selectedValue = els.departmentFilter.value;
  const departments = [...new Set(state.students.map((student) => student.department || student.className).filter(Boolean))].sort();
  els.departmentFilter.innerHTML = '<option value="">All departments</option>';
  departments.forEach((department) => {
    const option = document.createElement("option");
    option.value = department;
    option.textContent = department;
    els.departmentFilter.append(option);
  });
  els.departmentFilter.value = departments.includes(selectedValue) ? selectedValue : "";
}

function renderCourseFilter() {
  const selectedValue = els.courseFilter.value;
  els.courseFilter.innerHTML = '<option value="">All courses</option>';
  state.courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = `${course.name} (${course.id})`;
    els.courseFilter.append(option);
  });
  els.courseFilter.value = state.courses.some((course) => course.id === selectedValue) ? selectedValue : "";
}

function renderStudentCourseOptions(selectedCourseIds = []) {
  const selected = new Set(selectedCourseIds);
  const isExpanded = state.expandedLists.studentCourses;
  els.studentCourses.innerHTML = state.courses
    .map((course, index) => {
      const id = `student-course-${course.id}`;
      return `
        <label class="check-option ${!isExpanded && index >= LIST_LIMIT ? "is-collapsed" : ""}" for="${escapeHtml(id)}">
          <input id="${escapeHtml(id)}" type="checkbox" name="courseIds" value="${escapeHtml(course.id)}" ${selected.has(course.id) ? "checked" : ""}>
          <span>${escapeHtml(course.name)} <small>${escapeHtml(course.id)}</small></span>
        </label>
      `;
    })
    .join("");
  renderListToggle(els.studentCoursesToggle, "studentCourses", state.courses.length, "courses");

  if (!state.courses.length) {
    els.studentCourses.innerHTML = '<p class="empty">Add a course before registering students.</p>';
    renderListToggle(els.studentCoursesToggle, "studentCourses", 0, "courses");
  }
}

function renderAttendanceCourseSelect() {
  const selectedValue = els.attendanceCourseSelect.value;
  els.attendanceCourseSelect.innerHTML = '<option value="">Choose course</option>';
  state.courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = `${course.name} (${course.id})`;
    els.attendanceCourseSelect.append(option);
  });
  els.attendanceCourseSelect.value = state.courses.some((course) => course.id === selectedValue) ? selectedValue : "";
  renderAttendanceStudentSelect();
}

function renderAttendanceStudentSelect() {
  const selectedCourseId = els.attendanceCourseSelect.value;
  const selectedStudentId = els.studentSelect.value;
  const eligibleStudents = selectedCourseId
    ? state.students.filter((student) => normalizeCourseIds(student.courseIds).includes(selectedCourseId))
    : [];

  els.studentSelect.innerHTML = eligibleStudents
    .map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} (${escapeHtml(student.id)})</option>`)
    .join("");
  els.studentSelect.disabled = !selectedCourseId || !eligibleStudents.length;
  els.studentSelect.value = eligibleStudents.some((student) => student.id === selectedStudentId) ? selectedStudentId : "";

  if (selectedCourseId && !eligibleStudents.length) {
    els.studentSelect.innerHTML = '<option value="">No registered students</option>';
  }
}

function renderCourses() {
  const visibleCourses = getVisibleItems("courses", state.courses);
  els.coursesTable.innerHTML = visibleCourses
    .map((course) => {
      return `
        <tr>
          <td>${escapeHtml(course.id)}</td>
          <td>${escapeHtml(course.name)}</td>
          <td>${escapeHtml(course.department || course.className || "-")}</td>
          <td>${escapeHtml(course.semester || "-")}</td>
          <td>${escapeHtml(course.registered ?? 0)}</td>
          <td><button class="secondary small-button" data-edit-course="${escapeHtml(course.id)}" type="button">Edit</button></td>
        </tr>
      `;
    })
    .join("");
  renderListToggle(els.coursesToggle, "courses", state.courses.length, "courses");

  if (!state.courses.length) {
    els.coursesTable.innerHTML = '<tr><td colspan="6" class="empty">No courses added yet.</td></tr>';
    renderListToggle(els.coursesToggle, "courses", 0, "courses");
  }
}

function renderStudents() {
  const visibleStudents = getVisibleItems("students", state.students);
  els.studentsTable.innerHTML = visibleStudents
    .map((student) => {
      const courseText = normalizeCourseIds(student.courseIds).map(getCourseName).join(", ") || "-";
      return `
        <tr>
          <td>${escapeHtml(student.id)}</td>
          <td>${escapeHtml(student.name)}</td>
          <td>${escapeHtml(student.department || student.className)}</td>
          <td>${escapeHtml(student.level || "-")}</td>
          <td>${escapeHtml(courseText)}</td>
          <td>${escapeHtml(student.fingerprintId || "-")}</td>
          <td class="row-actions">
            <button class="secondary small-button" data-edit-student="${escapeHtml(student.id)}" type="button">Edit</button>
            <button class="danger" data-delete="${escapeHtml(student.id)}" title="Delete ${escapeHtml(student.name)}" aria-label="Delete ${escapeHtml(student.name)}">X</button>
          </td>
        </tr>
      `;
    })
    .join("");
  renderListToggle(els.studentsToggle, "students", state.students.length, "students");

  if (!state.students.length) {
    els.studentsTable.innerHTML = '<tr><td colspan="7" class="empty">No students registered yet.</td></tr>';
    renderListToggle(els.studentsToggle, "students", 0, "students");
  }
}

function renderRecentRecords(records) {
  const visibleRecords = getVisibleItems("recentRecords", records);
  els.recordsList.innerHTML = visibleRecords
    .map((record) => {
      return `
        <article class="record">
          <strong>${escapeHtml(record.studentName)}</strong>
          <span>${escapeHtml(record.courseName || record.courseId || "-")} | ${escapeHtml(record.department || record.className)} | ${escapeHtml(record.level || "-")} | ${escapeHtml(record.studentId)}</span>
          <span>${escapeHtml(formatTime(record.timestamp))}</span>
          <span class="badge">${escapeHtml(record.status)}</span>
        </article>
      `;
    })
    .join("");
  renderListToggle(els.recentRecordsToggle, "recentRecords", records.length, "records");

  if (!records.length) {
    els.recordsList.innerHTML = '<p class="empty">No attendance has been recorded yet.</p>';
    renderListToggle(els.recentRecordsToggle, "recentRecords", 0, "records");
  }
}

function renderRecordsTable(records) {
  const visibleRecords = getVisibleItems("records", records);
  els.recordsTable.innerHTML = visibleRecords
    .map((record) => {
      return `
        <tr>
          <td>${escapeHtml(formatTime(record.timestamp))}</td>
          <td>${escapeHtml(record.studentName)}</td>
          <td>${escapeHtml(record.studentId)}</td>
          <td>${escapeHtml(record.courseName || record.courseId || "-")}</td>
          <td>${escapeHtml(record.department || record.className)}</td>
          <td>${escapeHtml(record.level || "-")}</td>
          <td><span class="badge">${escapeHtml(record.status)}</span></td>
          <td>${escapeHtml(record.method || "-")}</td>
        </tr>
      `;
    })
    .join("");
  renderListToggle(els.recordsToggle, "records", records.length, "records");

  if (!records.length) {
    els.recordsTable.innerHTML = '<tr><td colspan="8" class="empty">No attendance records match these filters.</td></tr>';
    renderListToggle(els.recordsToggle, "records", 0, "records");
  }

  const visibleCount = visibleRecords.length;
  els.filterSummary.textContent = `${visibleCount} of ${records.length} attendance record${records.length === 1 ? "" : "s"} shown.`;
}

function startStudentEdit(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;

  state.editingStudentId = student.id;
  els.studentForm.elements.id.value = student.id;
  els.studentForm.elements.id.disabled = true;
  els.studentForm.elements.name.value = student.name;
  els.studentForm.elements.department.value = student.department || student.className || "";
  els.studentForm.elements.level.value = student.level || "";
  els.studentForm.elements.fingerprintId.value = student.fingerprintId || "";
  els.studentForm.elements.contact.value = student.contact || student.guardianPhone || "";
  renderStudentCourseOptions(normalizeCourseIds(student.courseIds));
  els.studentSubmitBtn.textContent = "Save Student";
  els.cancelStudentEditBtn.hidden = false;
  els.formMessage.textContent = "";
  els.studentForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startCourseEdit(courseId) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return;

  state.editingCourseId = course.id;
  els.courseForm.elements.id.value = course.id;
  els.courseForm.elements.id.disabled = true;
  els.courseForm.elements.name.value = course.name;
  els.courseForm.elements.department.value = course.department || course.className || "";
  els.courseForm.elements.semester.value = course.semester || "";
  els.courseSubmitBtn.textContent = "Save Course";
  els.cancelCourseEditBtn.hidden = false;
  els.courseMessage.textContent = "";
  els.courseForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadRecords() {
  const query = getFilterParams().toString();
  state.filteredRecords = await api(`/api/attendance${query ? `?${query}` : ""}`);
  renderRecordsTable(state.filteredRecords);
}

async function loadDashboard() {
  const [summary, students, courses] = await Promise.all([api("/api/summary"), api("/api/students"), api("/api/courses")]);
  state.students = students;
  state.courses = courses;
  state.records = summary.latestRecords;
  els.totalStudents.textContent = summary.totalStudents;
  els.presentToday.textContent = summary.presentToday;
  els.absentToday.textContent = summary.absentToday;
  renderDepartmentFilter();
  renderCourseFilter();
  renderStudentCourseOptions(state.editingStudentId ? normalizeCourseIds(state.students.find((student) => student.id === state.editingStudentId)?.courseIds) : []);
  renderAttendanceCourseSelect();
  renderCourses();
  renderStudents();
  renderRecentRecords(summary.latestRecords);
  await loadRecords();
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  els.loginMessage.textContent = "";

  try {
    const session = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    showDashboard(session.username);
    await loadDashboard();
  } catch (error) {
    showLogin(error.message);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  showLogin("Signed out.");
});

els.studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = buildStudentPayload(form);
  const editingId = state.editingStudentId;
  els.formMessage.textContent = "";

  try {
    await api(editingId ? `/api/students/${encodeURIComponent(editingId)}` : "/api/students", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetStudentForm();
    els.formMessage.textContent = editingId ? "Student updated." : "Student registered.";
    await loadDashboard();
  } catch (error) {
    els.formMessage.textContent = error.message;
  }
});

els.courseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = buildCoursePayload(form);
  const editingId = state.editingCourseId;
  els.courseMessage.textContent = "";

  try {
    await api(editingId ? `/api/courses/${encodeURIComponent(editingId)}` : "/api/courses", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetCourseForm();
    els.courseMessage.textContent = editingId ? "Course updated." : "Course added.";
    await loadDashboard();
  } catch (error) {
    els.courseMessage.textContent = error.message;
  }
});

els.attendanceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const studentId = String(formData.get("studentId") || "").trim();
  const courseId = String(formData.get("courseId") || "").trim();
  if (!studentId || !courseId) return;
  els.attendanceMessage.textContent = "";

  try {
    const result = await api("/api/attendance", {
      method: "POST",
      body: JSON.stringify({ studentId, courseId, method: "manual", deviceId: "dashboard" })
    });
    els.attendanceMessage.textContent = result.duplicate ? "Attendance already marked for this course today." : "Attendance marked.";
    await loadDashboard();
  } catch (error) {
    els.attendanceMessage.textContent = error.message;
  }
});

els.attendanceCourseSelect.addEventListener("change", renderAttendanceStudentSelect);

els.studentsTable.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-student]");
  if (editButton) {
    startStudentEdit(editButton.dataset.editStudent);
    return;
  }

  const button = event.target.closest("[data-delete]");
  if (!button) return;
  await api(`/api/students/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
  if (state.editingStudentId === button.dataset.delete) resetStudentForm();
  await loadDashboard();
});

els.coursesTable.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-course]");
  if (!editButton) return;
  startCourseEdit(editButton.dataset.editCourse);
});

els.dashboardView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-list]");
  if (!button) return;

  const key = button.dataset.toggleList;
  if (!(key in state.expandedLists)) return;

  state.expandedLists[key] = !state.expandedLists[key];

  if (key === "studentCourses") {
    const courseInputs = els.studentForm.querySelectorAll('input[name="courseIds"]');
    const selectedIds = Array.from(courseInputs)
      .filter((input) => input.checked)
      .map((input) => input.value);
    renderStudentCourseOptions(selectedIds);
  } else if (key === "courses") {
    renderCourses();
  } else if (key === "students") {
    renderStudents();
  } else if (key === "recentRecords") {
    renderRecentRecords(state.records);
  } else if (key === "records") {
    renderRecordsTable(state.filteredRecords);
  }
});

els.cancelStudentEditBtn.addEventListener("click", () => {
  resetStudentForm();
  els.formMessage.textContent = "";
});

els.cancelCourseEditBtn.addEventListener("click", () => {
  resetCourseForm();
  els.courseMessage.textContent = "";
});

els.filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadRecords();
});

els.clearFiltersBtn.addEventListener("click", async () => {
  els.filterForm.reset();
  await loadRecords();
});

els.printBtn.addEventListener("click", () => {
  const query = getFilterParams().toString();
  window.open(`/api/attendance/pdf${query ? `?${query}` : ""}`, "_blank", "noopener");
});

els.refreshBtn.addEventListener("click", loadDashboard);

api("/api/session")
  .then(async (session) => {
    if (!session.authenticated) {
      showLogin();
      return;
    }
    showDashboard(session.username);
    await loadDashboard();
  })
  .catch((error) => {
    showLogin(error.message);
  });
