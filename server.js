const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "attendance.json");
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || "change-me";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_COOKIE = "attendance_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEFAULT_COURSE_ID = "CRS-GEN";
const sessions = new Map();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function makeDefaultCourse() {
  return {
    id: DEFAULT_COURSE_ID,
    name: "General Course Attendance",
    department: "",
    level: "",
    semester: "",
    className: "",
    createdAt: nowIso()
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const defaultCourse = makeDefaultCourse();
    const seed = {
      courses: [defaultCourse],
      students: [
        {
          id: "CSC/26/001",
          name: "Amina Yusuf",
          department: "Computer Science",
          level: "100 Level",
          fingerprintId: "101",
          contact: "",
          courseIds: [defaultCourse.id],
          createdAt: nowIso()
        },
        {
          id: "CSC/26/002",
          name: "Chinedu Okafor",
          department: "Computer Science",
          level: "100 Level",
          fingerprintId: "102",
          contact: "",
          courseIds: [defaultCourse.id],
          createdAt: nowIso()
        }
      ],
      records: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (migrateDb(db)) writeDb(db);
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendBuffer(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeCourseId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCourseIds(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
        .split(",")
        .map((value) => value.trim());

  return [...new Set(values.map(normalizeCourseId).filter(Boolean))];
}

function normalizeCourse(input) {
  const department = String(input.department || input.className || "").trim();
  return {
    id: normalizeCourseId(input.id || input.courseId),
    name: String(input.name || "").trim(),
    department,
    semester: String(input.semester || "").trim(),
    className: department
  };
}

function normalizeStudent(input) {
  const department = String(input.department || input.className || "").trim();
  const contact = String(input.contact || input.guardianPhone || "").trim();
  return {
    id: String(input.id || "").trim().toUpperCase(),
    name: String(input.name || "").trim(),
    department,
    level: String(input.level || "").trim(),
    fingerprintId: String(input.fingerprintId || "").trim(),
    contact,
    className: department,
    guardianPhone: contact,
    courseIds: normalizeCourseIds(input.courseIds)
  };
}

function migrateDb(db) {
  let changed = false;

  if (!Array.isArray(db.courses)) {
    db.courses = [makeDefaultCourse()];
    changed = true;
  }

  if (!db.courses.some((course) => course.id === DEFAULT_COURSE_ID)) {
    db.courses.unshift(makeDefaultCourse());
    changed = true;
  }

  db.courses.forEach((course) => {
    if (course.name === "General Attendance") {
      course.name = "General Course Attendance";
      changed = true;
    }
    const department = String(course.department || course.className || "").trim();
    if (course.department !== department) {
      course.department = department;
      changed = true;
    }
    if (course.className !== department) {
      course.className = department;
      changed = true;
    }
    if (typeof course.semester !== "string") {
      course.semester = "";
      changed = true;
    }
  });

  if (!Array.isArray(db.students)) {
    db.students = [];
    changed = true;
  }

  db.students.forEach((student) => {
    const department = String(student.department || student.className || "").trim();
    const contact = String(student.contact || student.guardianPhone || "").trim();
    if (student.department !== department) {
      student.department = department;
      changed = true;
    }
    if (student.className !== department) {
      student.className = department;
      changed = true;
    }
    if (typeof student.level !== "string") {
      student.level = "";
      changed = true;
    }
    if (student.contact !== contact) {
      student.contact = contact;
      changed = true;
    }
    if (student.guardianPhone !== contact) {
      student.guardianPhone = contact;
      changed = true;
    }

    const courseIds = normalizeCourseIds(student.courseIds);
    if (!courseIds.length) courseIds.push(DEFAULT_COURSE_ID);
    if (JSON.stringify(student.courseIds || []) !== JSON.stringify(courseIds)) {
      student.courseIds = courseIds;
      changed = true;
    }
  });

  if (!Array.isArray(db.records)) {
    db.records = [];
    changed = true;
  }

  db.records.forEach((record) => {
    if (!record.courseId) {
      record.courseId = DEFAULT_COURSE_ID;
      changed = true;
    }
    if (!record.courseName) {
      const course = db.courses.find((item) => item.id === record.courseId);
      record.courseName = course ? course.name : record.courseId;
      changed = true;
    }
    if (record.courseName === "General Attendance") {
      record.courseName = "General Course Attendance";
      changed = true;
    }
    const student = db.students.find((item) => item.id === record.studentId);
    const department = String(record.department || record.className || student?.department || "").trim();
    if (record.department !== department) {
      record.department = department;
      changed = true;
    }
    if (record.className !== department) {
      record.className = department;
      changed = true;
    }
    const level = String(record.level || student?.level || "").trim();
    if (record.level !== level) {
      record.level = level;
      changed = true;
    }
  });

  return changed;
}

function findCourse(db, courseId) {
  const cleanId = normalizeCourseId(courseId);
  return db.courses.find((course) => course.id === cleanId);
}

function getStudentCourseIds(student) {
  return normalizeCourseIds(student.courseIds);
}

function validateCourseIds(db, courseIds) {
  const missingIds = courseIds.filter((courseId) => !findCourse(db, courseId));
  return missingIds;
}

function getRouteId(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length));
}

function getStudentRegisteredCount(db, courseId) {
  return db.students.filter((student) => getStudentCourseIds(student).includes(courseId)).length;
}

function getPresentCountForCourseToday(db, courseId) {
  const today = getTodayKey();
  const presentIds = new Set(
    db.records
      .filter((record) => record.courseId === courseId && record.timestamp.startsWith(today))
      .map((record) => record.studentId)
  );
  return presentIds.size;
}

function findStudent(db, payload) {
  const studentId = String(payload.studentId || payload.id || "").trim().toUpperCase();
  const fingerprintId = String(payload.fingerprintId || "").trim();
  return db.students.find((student) => {
    return (studentId && student.id === studentId) || (fingerprintId && student.fingerprintId === fingerprintId);
  });
}

function resolveAttendanceCourse(db, student, payload = {}) {
  const requestedCourseId = normalizeCourseId(payload.courseId);
  const registeredCourseIds = getStudentCourseIds(student);
  const courseId = requestedCourseId || (registeredCourseIds.length === 1 ? registeredCourseIds[0] : "");

  if (!courseId) {
    return { error: "Course is required when the student is registered for multiple courses.", status: 400 };
  }

  const course = findCourse(db, courseId);
  if (!course) return { error: "Course not found.", status: 404 };
  if (!registeredCourseIds.includes(course.id)) {
    return { error: `${student.name} is not registered for ${course.name}.`, status: 409 };
  }

  return { course };
}

function findTodayAttendance(db, studentId, courseId) {
  const today = getTodayKey();
  return db.records.find((record) => {
    return record.studentId === studentId && record.courseId === courseId && record.timestamp.startsWith(today);
  });
}

function createAttendanceRecord(student, course, payload = {}) {
  return {
    id: makeId("att"),
    studentId: student.id,
    studentName: student.name,
    department: student.department,
    level: student.level,
    className: student.department,
    fingerprintId: student.fingerprintId,
    courseId: course.id,
    courseName: course.name,
    status: payload.status === "late" ? "late" : "present",
    deviceId: String(payload.deviceId || "esp32").trim(),
    method: String(payload.method || "fingerprint").trim(),
    note: String(payload.note || "").trim(),
    timestamp: nowIso()
  };
}

function verifyDevice(req) {
  if (DEVICE_TOKEN === "change-me") return true;
  const token = req.headers["x-device-token"];
  return token === DEVICE_TOKEN;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function safeCompare(a, b) {
  return crypto.timingSafeEqual(hashValue(a), hashValue(b));
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getSessionId(req) {
  return parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
}

function getSession(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_MAX_AGE_SECONDS * 1000) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function makeSessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function makeExpiredSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getAttendanceFilters(searchParams) {
  const status = String(searchParams.get("status") || "").trim().toLowerCase();
  return {
    dateFrom: cleanDate(searchParams.get("dateFrom")),
    dateTo: cleanDate(searchParams.get("dateTo")),
    department: String(searchParams.get("department") || searchParams.get("className") || "").trim(),
    courseId: normalizeCourseId(searchParams.get("courseId")),
    status: status === "present" || status === "late" ? status : "",
    studentId: String(searchParams.get("studentId") || "").trim().toUpperCase(),
    search: String(searchParams.get("search") || "").trim().slice(0, 80)
  };
}

function filterAttendance(records, filters) {
  const department = filters.department.toLowerCase();
  const search = filters.search.toLowerCase();

  return records.filter((record) => {
    const recordDate = String(record.timestamp || "").slice(0, 10);
    if (filters.dateFrom && recordDate < filters.dateFrom) return false;
    if (filters.dateTo && recordDate > filters.dateTo) return false;
    if (department && String(record.department || record.className || "").toLowerCase() !== department) return false;
    if (filters.courseId && record.courseId !== filters.courseId) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.studentId && record.studentId !== filters.studentId) return false;

    if (search) {
      const haystack = [
        record.studentName,
        record.studentId,
        record.department,
        record.level,
        record.className,
        record.courseId,
        record.courseName,
        record.fingerprintId,
        record.status,
        record.deviceId,
        record.method,
        record.note
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function truncateText(value, length) {
  const text = sanitizePdfText(value);
  if (text.length <= length) return text;
  return text.slice(0, Math.max(length - 3, 0)) + "...";
}

function padText(value, length) {
  const text = truncateText(value, length);
  return text + " ".repeat(Math.max(length - text.length, 0));
}

function formatRecordTime(value) {
  return sanitizePdfText(
    new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lagos"
    }).format(new Date(value))
  );
}

function getFilterSummary(filters) {
  const parts = [];
  if (filters.dateFrom) parts.push(`from ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`to ${filters.dateTo}`);
  if (filters.department) parts.push(`department ${filters.department}`);
  if (filters.courseId) parts.push(`course ${filters.courseId}`);
  if (filters.status) parts.push(`status ${filters.status}`);
  if (filters.studentId) parts.push(`matric ${filters.studentId}`);
  if (filters.search) parts.push(`search "${filters.search}"`);
  return parts.length ? parts.join(", ") : "All records";
}

function pdfText(x, y, size, text, font = "F1") {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
}

function pdfNumber(value) {
  return Number(value)
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function pdfRect(x, y, width, height, mode = "S") {
  return `${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(width)} ${pdfNumber(height)} re ${mode}`;
}

function pdfLine(x1, y1, x2, y2) {
  return `${pdfNumber(x1)} ${pdfNumber(y1)} m ${pdfNumber(x2)} ${pdfNumber(y2)} l S`;
}

function fitPdfCellText(value, width, fontSize) {
  const maxChars = Math.max(Math.floor((width - 8) / (fontSize * 0.48)), 3);
  return truncateText(value, maxChars);
}

function formatPdfStatus(value) {
  const text = sanitizePdfText(value || "-").toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "-";
}

function pdfCellText(x, y, width, height, text, options = {}) {
  const fontSize = options.fontSize || 7;
  const font = options.font || "F1";
  const align = options.align || "left";
  const cleanText = fitPdfCellText(text, width, fontSize);
  const approximateTextWidth = cleanText.length * fontSize * 0.48;
  let textX = x + 4;

  if (align === "right") textX = x + width - approximateTextWidth - 4;
  if (align === "center") textX = x + (width - approximateTextWidth) / 2;

  return pdfText(pdfNumber(Math.max(textX, x + 3)), pdfNumber(y + (height - fontSize) / 2 + 1.5), fontSize, cleanText, font);
}

function createAttendancePdf(records, filters) {
  const pageWidth = 792;
  const pageHeight = 612;
  const marginX = 36;
  const tableTop = 500;
  const footerY = 28;
  const headerHeight = 22;
  const rowHeight = 20;
  const columns = [
    { label: "No.", width: 30, align: "right" },
    { label: "Date / Time", width: 96 },
    { label: "Matric No.", width: 82 },
    { label: "Student", width: 108 },
    { label: "Course", width: 132 },
    { label: "Department", width: 96 },
    { label: "Level", width: 56 },
    { label: "Status", width: 56 },
    { label: "Method", width: 64 }
  ];
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const tableX = marginX;
  const rowsPerPage = Math.max(Math.floor((tableTop - headerHeight - footerY - 10) / rowHeight), 1);
  const pageChunks = records.length
    ? Array.from({ length: Math.ceil(records.length / rowsPerPage) }, (_, index) => {
        return records.slice(index * rowsPerPage, index * rowsPerPage + rowsPerPage);
      })
    : [[]];

  const generatedAt = formatRecordTime(nowIso());
  const filterSummary = getFilterSummary(filters);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
  ];
  const pageIds = [];

  function addObject(content) {
    objects.push(content);
    return objects.length;
  }

  function addTableHeader(lines) {
    const headerY = tableTop - headerHeight;
    lines.push("0.88 0.93 0.9 rg");
    lines.push(pdfRect(tableX, headerY, tableWidth, headerHeight, "f"));
    lines.push("0.43 0.51 0.46 RG");
    lines.push("0.55 w");
    lines.push(pdfRect(tableX, headerY, tableWidth, headerHeight, "S"));

    let x = tableX;
    columns.forEach((column) => {
      lines.push(pdfLine(x, headerY, x, tableTop));
      lines.push("0.07 0.13 0.1 rg");
      lines.push(pdfCellText(x, headerY, column.width, headerHeight, column.label, { font: "F2", fontSize: 7, align: column.align }));
      x += column.width;
    });
    lines.push(pdfLine(tableX + tableWidth, headerY, tableX + tableWidth, tableTop));
  }

  function getRowValues(record, index) {
    return [
      String(index),
      formatRecordTime(record.timestamp),
      record.studentId,
      record.studentName,
      record.courseId ? `${record.courseId} ${record.courseName || ""}` : record.courseName,
      record.department || record.className,
      record.level || "-",
      formatPdfStatus(record.status),
      record.method || "-"
    ];
  }

  function addDataRow(lines, rowY, values, isAlternate) {
    if (isAlternate) {
      lines.push("0.98 0.99 0.98 rg");
      lines.push(pdfRect(tableX, rowY, tableWidth, rowHeight, "f"));
    }

    lines.push("0.74 0.78 0.75 RG");
    lines.push("0.35 w");

    let x = tableX;
    columns.forEach((column, columnIndex) => {
      lines.push(pdfRect(x, rowY, column.width, rowHeight, "S"));
      lines.push("0.09 0.13 0.11 rg");
      lines.push(pdfCellText(x, rowY, column.width, rowHeight, values[columnIndex], { fontSize: 7, align: column.align }));
      x += column.width;
    });
  }

  pageChunks.forEach((chunk, pageIndex) => {
    const lines = [
      "0.7 w",
      "0.07 0.13 0.1 rg",
      pdfText(marginX, pageHeight - 42, 18, "Course Attendance Report", "F2"),
      "0.35 0.42 0.38 rg",
      pdfText(marginX, pageHeight - 62, 8, `Generated: ${generatedAt}`),
      pdfText(marginX, pageHeight - 76, 8, `Filters: ${truncateText(filterSummary, 150)}`),
      pdfText(pageWidth - 152, pageHeight - 62, 8, `Records: ${records.length}`),
      pdfText(pageWidth - 152, pageHeight - 76, 8, `Page: ${pageIndex + 1} of ${pageChunks.length}`),
      "0.43 0.51 0.46 RG",
      pdfLine(marginX, pageHeight - 90, pageWidth - marginX, pageHeight - 90)
    ];

    addTableHeader(lines);

    if (!chunk.length) {
      const emptyY = tableTop - headerHeight - rowHeight;
      lines.push("0.98 0.99 0.98 rg");
      lines.push(pdfRect(tableX, emptyY, tableWidth, rowHeight, "f"));
      lines.push("0.74 0.78 0.75 RG");
      lines.push(pdfRect(tableX, emptyY, tableWidth, rowHeight, "S"));
      lines.push("0.35 0.42 0.38 rg");
      lines.push(pdfText(tableX + 8, emptyY + 7, 8, "No attendance records match the selected filters."));
    } else {
      chunk.forEach((record, rowIndex) => {
        const globalIndex = pageIndex * rowsPerPage + rowIndex + 1;
        const rowY = tableTop - headerHeight - (rowIndex + 1) * rowHeight;
        addDataRow(lines, rowY, getRowValues(record, globalIndex), rowIndex % 2 === 1);
      });
    }

    lines.push("0.35 0.42 0.38 rg");
    lines.push(pdfText(marginX, 18, 7, "University Course Attendance"));
    lines.push(pdfText(pageWidth - 95, 18, 7, `Page ${pageIndex + 1} of ${pageChunks.length}`));

    const stream = lines.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

async function handleDeviceCheckIn(req, res) {
  if (!verifyDevice(req)) return sendJson(res, 401, { error: "Invalid device token." });

  const db = readDb();
  const payload = await parseBody(req);
  const student = findStudent(db, payload);
  if (!student) return sendJson(res, 404, { ok: false, error: "Fingerprint not registered." });

  const courseResult = resolveAttendanceCourse(db, student, payload);
  if (courseResult.error) return sendJson(res, courseResult.status, { ok: false, error: courseResult.error });

  const alreadyMarked = findTodayAttendance(db, student.id, courseResult.course.id);
  if (alreadyMarked) {
    return sendJson(res, 200, {
      ok: true,
      duplicate: true,
      message: `${student.name} already marked today for ${courseResult.course.name}`,
      student,
      course: courseResult.course,
      record: alreadyMarked
    });
  }

  const record = createAttendanceRecord(student, courseResult.course, payload);
  db.records.push(record);
  writeDb(db);
  return sendJson(res, 201, {
    ok: true,
    duplicate: false,
    message: `${student.name} marked present for ${courseResult.course.name}`,
    student,
    course: courseResult.course,
    record
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/login") {
    const payload = await parseBody(req);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!safeCompare(username, ADMIN_USERNAME) || !safeCompare(password, ADMIN_PASSWORD)) {
      return sendJson(res, 401, { error: "Invalid username or password." });
    }

    const sessionId = makeId("sess");
    sessions.set(sessionId, { username, createdAt: Date.now() });
    return sendJson(res, 200, { ok: true, username }, { "Set-Cookie": makeSessionCookie(sessionId) });
  }

  if (req.method === "GET" && pathname === "/api/session") {
    const session = getSession(req);
    return sendJson(res, 200, {
      authenticated: Boolean(session),
      username: session ? session.username : null
    });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const sessionId = getSessionId(req);
    if (sessionId) sessions.delete(sessionId);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": makeExpiredSessionCookie() });
  }

  if (req.method === "POST" && pathname === "/api/device/check-in") {
    return handleDeviceCheckIn(req, res);
  }

  if (!getSession(req)) {
    return sendJson(res, 401, { error: "Please log in to use the dashboard." });
  }

  const db = readDb();

  if (req.method === "GET" && pathname === "/api/summary") {
    const today = getTodayKey();
    const todayRecords = db.records.filter((record) => record.timestamp.startsWith(today));
    const todayMarks = new Set(todayRecords.map((record) => `${record.studentId}:${record.courseId}`));
    const expectedMarks = db.students.reduce((total, student) => total + getStudentCourseIds(student).length, 0);
    const courseSummary = db.courses.map((course) => {
      const registered = getStudentRegisteredCount(db, course.id);
      const present = getPresentCountForCourseToday(db, course.id);
      return {
        ...course,
        registered,
        presentToday: present,
        absentToday: Math.max(registered - present, 0)
      };
    });
    return sendJson(res, 200, {
      totalStudents: db.students.length,
      totalCourses: db.courses.length,
      expectedMarksToday: expectedMarks,
      presentToday: todayMarks.size,
      absentToday: Math.max(expectedMarks - todayMarks.size, 0),
      courseSummary,
      latestRecords: db.records.slice(-12).reverse()
    });
  }

  if (req.method === "GET" && pathname === "/api/courses") {
    const courses = db.courses
      .map((course) => ({
        ...course,
        registered: getStudentRegisteredCount(db, course.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return sendJson(res, 200, courses);
  }

  if (req.method === "POST" && pathname === "/api/courses") {
    const input = normalizeCourse(await parseBody(req));
    if (!input.id || !input.name) {
      return sendJson(res, 400, { error: "Course code and course name are required." });
    }
    if (db.courses.some((course) => course.id === input.id)) {
      return sendJson(res, 409, { error: "A course with that code already exists." });
    }
    const course = { ...input, createdAt: nowIso() };
    db.courses.push(course);
    writeDb(db);
    return sendJson(res, 201, course);
  }

  if ((req.method === "PUT" || req.method === "PATCH") && pathname.startsWith("/api/courses/")) {
    const id = normalizeCourseId(getRouteId(pathname, "/api/courses/"));
    const course = findCourse(db, id);
    if (!course) return sendJson(res, 404, { error: "Course not found." });

    const input = normalizeCourse({ ...(await parseBody(req)), id });
    if (!input.name) return sendJson(res, 400, { error: "Course name is required." });

    course.name = input.name;
    course.department = input.department;
    course.semester = input.semester;
    course.className = input.department;
    db.records.forEach((record) => {
      if (record.courseId === course.id) record.courseName = course.name;
    });
    writeDb(db);
    return sendJson(res, 200, course);
  }

  if (req.method === "GET" && pathname === "/api/students") {
    return sendJson(res, 200, db.students.sort((a, b) => a.name.localeCompare(b.name)));
  }

  if (req.method === "POST" && pathname === "/api/students") {
    const input = normalizeStudent(await parseBody(req));
    if (!input.id || !input.name || !input.department || !input.level) {
      return sendJson(res, 400, { error: "Matric number, name, department, and level are required." });
    }
    if (!input.courseIds.length) {
      return sendJson(res, 400, { error: "Register the student for at least one course." });
    }
    const missingCourseIds = validateCourseIds(db, input.courseIds);
    if (missingCourseIds.length) {
      return sendJson(res, 400, { error: `Unknown course code: ${missingCourseIds.join(", ")}` });
    }
    if (db.students.some((student) => student.id === input.id)) {
      return sendJson(res, 409, { error: "A student with that ID already exists." });
    }
    if (input.fingerprintId && db.students.some((student) => student.fingerprintId === input.fingerprintId)) {
      return sendJson(res, 409, { error: "That fingerprint ID is already assigned." });
    }
    const student = { ...input, createdAt: nowIso() };
    db.students.push(student);
    writeDb(db);
    return sendJson(res, 201, student);
  }

  if ((req.method === "PUT" || req.method === "PATCH") && pathname.startsWith("/api/students/")) {
    const id = getRouteId(pathname, "/api/students/").toUpperCase();
    const student = db.students.find((item) => item.id === id);
    if (!student) return sendJson(res, 404, { error: "Student not found." });

    const input = normalizeStudent({ ...(await parseBody(req)), id });
    if (!input.name || !input.department || !input.level) {
      return sendJson(res, 400, { error: "Student name, department, and level are required." });
    }
    if (!input.courseIds.length) {
      return sendJson(res, 400, { error: "Register the student for at least one course." });
    }
    const missingCourseIds = validateCourseIds(db, input.courseIds);
    if (missingCourseIds.length) {
      return sendJson(res, 400, { error: `Unknown course code: ${missingCourseIds.join(", ")}` });
    }
    if (
      input.fingerprintId &&
      db.students.some((item) => item.id !== id && item.fingerprintId === input.fingerprintId)
    ) {
      return sendJson(res, 409, { error: "That fingerprint ID is already assigned." });
    }

    student.name = input.name;
    student.department = input.department;
    student.level = input.level;
    student.className = input.department;
    student.fingerprintId = input.fingerprintId;
    student.contact = input.contact;
    student.guardianPhone = input.contact;
    student.courseIds = input.courseIds;
    db.records.forEach((record) => {
      if (record.studentId === student.id) {
        record.studentName = student.name;
        record.department = student.department;
        record.level = student.level;
        record.className = student.department;
        record.fingerprintId = student.fingerprintId;
      }
    });
    writeDb(db);
    return sendJson(res, 200, student);
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/students/")) {
    const id = getRouteId(pathname, "/api/students/").toUpperCase();
    const before = db.students.length;
    db.students = db.students.filter((student) => student.id !== id);
    if (db.students.length === before) return sendJson(res, 404, { error: "Student not found." });
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/attendance") {
    const filters = getAttendanceFilters(url.searchParams);
    return sendJson(res, 200, filterAttendance(db.records, filters).slice().reverse());
  }

  if (req.method === "GET" && pathname === "/api/attendance/pdf") {
    const filters = getAttendanceFilters(url.searchParams);
    const records = filterAttendance(db.records, filters).slice().reverse();
    const pdf = createAttendancePdf(records, filters);
    const filename = `attendance-report-${getTodayKey()}.pdf`;
    return sendBuffer(res, 200, pdf, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": pdf.length
    });
  }

  if (req.method === "POST" && pathname === "/api/attendance") {
    const payload = await parseBody(req);
    const student = findStudent(db, payload);
    if (!student) return sendJson(res, 404, { error: "Student or fingerprint ID not found." });

    const courseResult = resolveAttendanceCourse(db, student, payload);
    if (courseResult.error) return sendJson(res, courseResult.status, { error: courseResult.error });

    const alreadyMarked = findTodayAttendance(db, student.id, courseResult.course.id);
    if (alreadyMarked) {
      return sendJson(res, 200, { ok: true, duplicate: true, record: alreadyMarked });
    }

    const record = createAttendanceRecord(student, courseResult.course, payload);
    db.records.push(record);
    writeDb(db);
    return sendJson(res, 201, { ok: true, duplicate: false, record });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path
    .normalize(requestedPath)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");

  fs.readFile(filePath, (err, content) => {
    if (err) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

ensureDb();
server.listen(PORT, () => {
  console.log(`Attendance system running at http://localhost:${PORT}`);
  console.log(`Dashboard login username: ${ADMIN_USERNAME}`);
  console.log("ESP32 endpoint: POST /api/device/check-in");
});
