# ESP32 University Course Attendance System

A small university attendance dashboard for registering students, enrolling them in courses, and recording course attendance from an ESP32 fingerprint/RFID device.

## Run

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

The app stores data in `data/attendance.json`.

Default dashboard login:

```text
Username: admin
Password: admin123
```

You can change the dashboard login before starting the server:

```powershell
$env:ADMIN_USERNAME="your-admin-name"
$env:ADMIN_PASSWORD="your-strong-password"
npm start
```

## Courses and Attendance Reports

Add courses in the Courses panel, including department and semester where needed. Then enroll each student in one or more courses when adding or editing a student. Attendance is marked per course, so the same student can be present for CSC101 and still need attendance for MTH101 on the same day.

Use the Attendance Records panel to filter by date, department, course, status, or search text. Click **Print PDF** to open a filtered PDF report that can be printed or saved.

## ESP32 Check-In API

Send a JSON `POST` request to:

```text
http://<server-ip>:3000/api/device/check-in
```

Request body using a fingerprint template ID:

```json
{
  "fingerprintId": "101",
  "courseId": "MTH101",
  "deviceId": "esp32-main-gate"
}
```

Request body using a matric number:

```json
{
  "studentId": "CSC/26/001",
  "courseId": "MTH101",
  "deviceId": "esp32-main-gate"
}
```

Successful response:

```json
{
  "ok": true,
  "duplicate": false,
  "message": "Amina Yusuf marked present for Mathematics"
}
```

If a student is enrolled in only one course, `courseId` can be omitted and the app will use that course automatically. If the student is enrolled in multiple courses, `courseId` is required.

## Optional Device Token

By default, the device endpoint is open for local testing. To require a token:

```powershell
$env:DEVICE_TOKEN="your-secret-token"
npm start
```

Then send this header from the ESP32:

```text
X-Device-Token: your-secret-token
```

## Example ESP32 HTTP Payload

```cpp
HTTPClient http;
http.begin("http://192.168.1.20:3000/api/device/check-in");
http.addHeader("Content-Type", "application/json");
http.addHeader("X-Device-Token", "your-secret-token");
String body = "{\"fingerprintId\":\"101\",\"courseId\":\"MTH101\",\"deviceId\":\"esp32-main-gate\"}";
int statusCode = http.POST(body);
String response = http.getString();
http.end();
```
