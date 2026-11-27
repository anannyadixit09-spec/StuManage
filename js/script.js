/* ==========================================================================
   Stumanage front-end JavaScript
   Data is stored in this browser using localStorage. No backend required.
   ========================================================================== */
(() => {
    'use strict';
  
    const STORAGE_KEY = 'stumanageData_v1';
    const DEFAULT_DATA = {
        students: [],
        courses: [],
        attendance: [],
        studySessions: [],
        activity: [],
        settings: { minimumAttendance: 75 }
    };
  
    // --- Data Management Utilities ---
    function makeId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  
    function loadData() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (!saved || typeof saved !== 'object') return structuredCloneSafe(DEFAULT_DATA);
            return {
                ...structuredCloneSafe(DEFAULT_DATA),
                ...saved,
                students: Array.isArray(saved.students) ? saved.students : [],
                courses: Array.isArray(saved.courses) ? saved.courses : [],
                attendance: Array.isArray(saved.attendance) ? saved.attendance : [],
                studySessions: Array.isArray(saved.studySessions) ? saved.studySessions : [],
                activity: Array.isArray(saved.activity) ? saved.activity : [],
                settings: { ...DEFAULT_DATA.settings, ...(saved.settings || {}) }
            };
        } catch (error) {
            console.error('Could not load Stumanage data:', error);
            return structuredCloneSafe(DEFAULT_DATA);
        }
    }
  
    function structuredCloneSafe(value) {
        return JSON.parse(JSON.stringify(value));
    }
  
    let data = loadData();
    let toastTimeout;
  
    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Could not save Stumanage data:', error);
            showToast('Could not save data in this browser. Check your storage settings.');
            return false;
        }
    }
  
    // --- UI Helpers ---
    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
  
    function byId(id) { return document.getElementById(id); }
  
    function showToast(message) {
        let toast = byId('stumanage-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'stumanage-toast';
            toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1e293b;color:#fff;padding:12px 24px;border-radius:6px;z-index:9999;transition:opacity 0.3s, transform 0.3s;opacity:0;transform:translateY(10px);box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:inherit;';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        window.clearTimeout(toastTimeout);
        toastTimeout = window.setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 3000);
    }
  
    function addActivity(message) {
        data.activity.unshift({ id: makeId(), message, at: new Date().toISOString() });
        data.activity = data.activity.slice(0, 10); // Keep last 10
    }
  
    function saveAndRefresh(message) {
        if (message) addActivity(message);
        saveData();
        showToast(message || 'Changes saved successfully.');
    }
  
    // --- Core Calculations ---
    function studentById(id) { return data.students.find(s => s.id === id); }
    function courseById(id) { return data.courses.find(c => c.id === id); }
    
    function attendancePercent(record) {
        return Number(record.totalClasses) > 0 ? (Number(record.attendedClasses) / Number(record.totalClasses)) * 100 : 0;
    }
    
    function percentageText(value) { return `${value.toFixed(1).replace(/\.0$/, '')}%`; }
    
    function formatDateTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
  
    // ==========================================================================
    // Page Initializers
    // ==========================================================================
  
    function initDashboard() {
        byId('totalstudent').textContent = String(data.students.length);
        byId('totalcourse').textContent = String(data.courses.length);
        
        let totalClasses = 0, totalAttended = 0;
        let lowCount = 0;
        const target = Number(data.settings.minimumAttendance);
        const alertBox = byId('dashboardAlerts');
        const activityBox = byId('dashboardActivity');
  
        // Calculate attendance & warnings
        const warningsHTML = [];
        data.attendance.forEach(record => {
            totalClasses += Number(record.totalClasses);
            totalAttended += Number(record.attendedClasses);
            
            const perc = attendancePercent(record);
            if (perc < target) {
                lowCount++;
                const student = studentById(record.studentId);
                const course = courseById(record.courseId);
                warningsHTML.push(`<div style="margin-bottom:8px;">⚠️ <strong>${escapeHTML(student?.name || 'Unknown')}</strong> is at ${percentageText(perc)} in ${escapeHTML(course?.name || 'Unknown')}</div>`);
            }
        });
  
        byId('avgattendance').textContent = totalClasses > 0 ? percentageText((totalAttended / totalClasses) * 100) : '0%';
        byId('lowattendance').textContent = String(lowCount);
  
        // Populate Alerts
        if (warningsHTML.length > 0) {
            alertBox.className = '';
            alertBox.innerHTML = warningsHTML.join('');
        } else {
            alertBox.className = 'empty-state';
            alertBox.textContent = data.attendance.length ? 'All students are meeting the attendance target!' : 'No attendance data yet.';
        }
  
        // Populate Activity
        if (data.activity.length > 0) {
            activityBox.className = '';
            activityBox.innerHTML = data.activity.map(item => `
                <div style="margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px;">
                    <div><strong>${escapeHTML(item.message)}</strong></div>
                    <small style="color:#64748b;">${escapeHTML(formatDateTime(item.at))}</small>
                </div>
            `).join('');
        }
    }
  
    function initStudents() {
        const form = byId('studentForm');
        const tbody = byId('studentRows');
        const search = byId('studentsearch');
  
        function render() {
            const term = search.value.trim().toLowerCase();
            const filtered = data.students.filter(s => `${s.name} ${s.roll}`.toLowerCase().includes(term));
            
            byId('studentcount').textContent = `${data.students.length} Students`;
            byId('studentempty').style.display = filtered.length ? 'none' : 'block';
  
            tbody.innerHTML = filtered.map(student => `
                <tr>
                    <td><strong><a href="student-details.html?id=${escapeHTML(student.id)}">${escapeHTML(student.name)}</a></strong></td>
                    <td>${escapeHTML(student.roll)}</td>
                    <td>B.Tech CSE (AI & DS)</td>
                    <td>${escapeHTML(student.semester)}</td>
                    <td>${escapeHTML(student.email || '—')}</td>
                    <td>
                        <button class="button secondary" style="padding:4px 8px; font-size:0.85rem;" data-action="edit" data-id="${escapeHTML(student.id)}">Edit</button>
                        <button class="button secondary" style="padding:4px 8px; font-size:0.85rem; color:#ef4444;" data-action="delete" data-id="${escapeHTML(student.id)}">Del</button>
                    </td>
                </tr>
            `).join('');
        }
  
        function resetForm() {
            form.reset();
            byId('studentId').value = '';
            byId('studentformheading').textContent = 'Add a Student';
            byId('saveStudentButton').textContent = 'Add Student';
            byId('cancelStudentEdit').hidden = true;
        }
  
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = byId('studentId').value;
            const name = byId('studentName').value.trim();
            const roll = byId('studentRoll').value.trim();
            const email = byId('studentEmail').value.trim();
            const semester = byId('studentSemester').value.trim();
            
            const duplicate = data.students.some(s => s.roll.toLowerCase() === roll.toLowerCase() && s.id !== id);
            if (duplicate) return showToast('A student with this roll number already exists.');
  
            if (id) {
                const student = studentById(id);
                Object.assign(student, { name, roll, email, semester });
                saveAndRefresh(`Updated student: ${name}`);
            } else {
                data.students.push({ id: makeId(), name, roll, email, semester });
                saveAndRefresh(`Added student: ${name}`);
            }
            resetForm(); render();
        });
  
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const student = studentById(btn.dataset.id);
            
            if (btn.dataset.action === 'edit') {
                byId('studentId').value = student.id;
                byId('studentName').value = student.name;
                byId('studentRoll').value = student.roll;
                byId('studentEmail').value = student.email || '';
                byId('studentSemester').value = student.semester || '';
                
                byId('studentformheading').textContent = 'Edit Student';
                byId('saveStudentButton').textContent = 'Save Changes';
                byId('cancelStudentEdit').hidden = false;
                byId('student_form').scrollIntoView({ behavior: 'smooth' });
            } else if (btn.dataset.action === 'delete') {
                if (!window.confirm(`Delete ${student.name}?`)) return;
                data.students = data.students.filter(s => s.id !== student.id);
                data.courses.forEach(c => { c.studentIds = (c.studentIds || []).filter(id => id !== student.id); });
                data.attendance = data.attendance.filter(a => a.studentId !== student.id);
                saveAndRefresh(`Deleted student: ${student.name}`); render();
            }
        });
  
        byId('cancelStudentEdit').addEventListener('click', resetForm);
        search.addEventListener('input', render);
        render();
    }
  
    function initCourses() {
        const form = byId('courseform');
        const select = byId('courseStudents');
        const tbody = byId('courseRows');
  
        function renderStudentsOptions(selectedIds = []) {
            select.innerHTML = data.students.map(s => 
                `<option value="${escapeHTML(s.id)}" ${selectedIds.includes(s.id) ? 'selected' : ''}>${escapeHTML(s.name)} (${escapeHTML(s.roll)})</option>`
            ).join('');
        }
  
        function render() {
            byId('coursecount').textContent = `${data.courses.length} Courses`;
            byId('courseempty').style.display = data.courses.length ? 'none' : 'block';
  
            tbody.innerHTML = data.courses.map(course => {
                const count = (course.studentIds || []).length;
                return `
                    <tr>
                        <td><strong>${escapeHTML(course.name)}</strong></td>
                        <td>${escapeHTML(course.code)}</td>
                        <td>${escapeHTML(course.semester || '—')}</td>
                        <td>${count} assigned</td>
                        <td>
                            <button class="button secondary" style="padding:4px 8px; font-size:0.85rem;" data-action="edit" data-id="${escapeHTML(course.id)}">Edit</button>
                            <button class="button secondary" style="padding:4px 8px; font-size:0.85rem; color:#ef4444;" data-action="delete" data-id="${escapeHTML(course.id)}">Del</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
  
        function resetForm() {
            form.reset();
            byId('courseId').value = '';
            byId('courseformheading').textContent = 'Add a Course';
            byId('saveCourseButton').textContent = 'Add Course';
            byId('cancelCourseEdit').hidden = true;
            renderStudentsOptions();
        }
  
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = byId('courseId').value;
            const name = byId('courseName').value.trim();
            const code = byId('courseCode').value.trim();
            const semester = byId('courseSemester').value.trim();
            const studentIds = Array.from(select.selectedOptions).map(opt => opt.value);
            
            if (id) {
                const course = courseById(id);
                Object.assign(course, { name, code, semester, studentIds });
                saveAndRefresh(`Updated course: ${name}`);
            } else {
                data.courses.push({ id: makeId(), name, code, semester, studentIds });
                saveAndRefresh(`Added course: ${name}`);
            }
            resetForm(); render();
        });
  
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const course = courseById(btn.dataset.id);
            
            if (btn.dataset.action === 'edit') {
                byId('courseId').value = course.id;
                byId('courseName').value = course.name;
                byId('courseCode').value = course.code;
                byId('courseSemester').value = course.semester || '';
                renderStudentsOptions(course.studentIds || []);
                
                byId('courseformheading').textContent = 'Edit Course';
                byId('saveCourseButton').textContent = 'Save Changes';
                byId('cancelCourseEdit').hidden = false;
                form.scrollIntoView({ behavior: 'smooth' });
            } else if (btn.dataset.action === 'delete') {
                if (!window.confirm(`Delete course ${course.name}?`)) return;
                data.courses = data.courses.filter(c => c.id !== course.id);
                data.attendance = data.attendance.filter(a => a.courseId !== course.id);
                saveAndRefresh(`Deleted course: ${course.name}`); render();
            }
        });
  
        byId('cancelCourseEdit').addEventListener('click', resetForm);
        renderStudentsOptions();
        render();
    }
  
    function initAttendance() {
        const form = byId('attendanceform');
        const sSelect = byId('attendanceStudent');
        const cSelect = byId('attendanceCourse');
        const tInput = byId('totalClasses');
        const aInput = byId('attendedClasses');
        const preview = byId('attendancePreview');
        const tbody = byId('attendanceRows');
  
        function renderDropdowns() {
            sSelect.innerHTML = '<option value="">Select a student...</option>' + 
                data.students.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)} (${escapeHTML(s.roll)})</option>`).join('');
            cSelect.innerHTML = '<option value="">Select a course...</option>';
        }
  
        function renderRows() {
            byId('attendancecount').textContent = `${data.attendance.length} Records`;
            byId('attendanceempty').style.display = data.attendance.length ? 'none' : 'block';
  
            tbody.innerHTML = data.attendance.map(record => {
                const s = studentById(record.studentId);
                const c = courseById(record.courseId);
                const missed = Number(record.totalClasses) - Number(record.attendedClasses);
                return `
                    <tr>
                        <td>${escapeHTML(s?.name || 'Unknown')}</td>
                        <td>${escapeHTML(c?.name || 'Unknown')}</td>
                        <td>${record.totalClasses}</td>
                        <td>${record.attendedClasses}</td>
                        <td>${missed}</td>
                        <td><strong>${percentageText(attendancePercent(record))}</strong></td>
                        <td><button class="button secondary" style="padding:4px 8px; font-size:0.85rem; color:#ef4444;" data-id="${escapeHTML(record.id)}">Del</button></td>
                    </tr>
                `;
            }).join('');
        }
  
        sSelect.addEventListener('change', () => {
            const sid = sSelect.value;
            const assigned = data.courses.filter(c => (c.studentIds || []).includes(sid));
            cSelect.innerHTML = '<option value="">Select a course...</option>' + 
                assigned.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
            tInput.value = ''; aInput.value = ''; preview.textContent = 'Enter class totals';
        });
  
        cSelect.addEventListener('change', () => {
            const existing = data.attendance.find(a => a.studentId === sSelect.value && a.courseId === cSelect.value);
            if (existing) {
                tInput.value = existing.totalClasses;
                aInput.value = existing.attendedClasses;
            } else {
                tInput.value = ''; aInput.value = '';
            }
            updatePreview();
        });
  
        function updatePreview() {
            const total = Number(tInput.value);
            const att = Number(aInput.value);
            if (total > 0 && att >= 0 && att <= total) {
                preview.textContent = percentageText((att / total) * 100);
            } else {
                preview.textContent = 'Enter valid totals';
            }
        }
  
        tInput.addEventListener('input', updatePreview);
        aInput.addEventListener('input', updatePreview);
  
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const sid = sSelect.value, cid = cSelect.value;
            const t = Number(tInput.value), a = Number(aInput.value);
            
            if (!sid || !cid) return showToast('Select student and course.');
            if (a > t || t <= 0) return showToast('Attended cannot exceed total classes.');
  
            const existing = data.attendance.find(rec => rec.studentId === sid && rec.courseId === cid);
            if (existing) {
                Object.assign(existing, { totalClasses: t, attendedClasses: a });
                saveAndRefresh('Attendance updated.');
            } else {
                data.attendance.push({ id: makeId(), studentId: sid, courseId: cid, totalClasses: t, attendedClasses: a });
                saveAndRefresh('Attendance recorded.');
            }
            form.reset(); preview.textContent = 'Enter class totals'; renderRows(); cSelect.innerHTML = '<option value="">Select a course...</option>';
        });
  
        tbody.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const id = e.target.dataset.id;
                if (!window.confirm('Delete this record?')) return;
                data.attendance = data.attendance.filter(a => a.id !== id);
                saveAndRefresh('Record deleted.'); renderRows();
            }
        });
  
        renderDropdowns(); renderRows();
    }
  
    function initStudentDetails() {
        const id = new URLSearchParams(window.location.search).get('id');
        const s = studentById(id);
        
        if (!s) {
            byId('studentNotFound').hidden = false;
            byId('studentNotFound').textContent = 'Student not found.';
            byId('studentProfile').hidden = true;
            return;
        }
  
        byId('detailStudentName').textContent = s.name;
        byId('detailStudentRoll').textContent = `Roll Number: ${s.roll}`;
        byId('detailStudentEmail').textContent = s.email || '—';
        byId('detailStudentSemester').textContent = s.semester || '—';
        byId('detailStudentDepartment').textContent = 'B.Tech CSE (AI & DS)'; // Default from context
        
        byId('detailEditStudent').href = `students.html?edit=${encodeURIComponent(s.id)}`;
  
        const target = Number(data.settings.minimumAttendance);
        byId('detailAttendanceTarget').textContent = `${target}%`;
  
        const assignedCourses = data.courses.filter(c => (c.studentIds || []).includes(s.id));
        byId('detailCourseCount').textContent = String(assignedCourses.length);
        
        let totClasses = 0, totAtt = 0, lowCount = 0;
        const tbody = byId('detailCourseRows');
  
        byId('detailCourseEmpty').style.display = assignedCourses.length ? 'none' : 'block';
  
        tbody.innerHTML = assignedCourses.map(c => {
            const rec = data.attendance.find(a => a.studentId === s.id && a.courseId === c.id);
            if (rec) {
                totClasses += Number(rec.totalClasses);
                totAtt += Number(rec.attendedClasses);
                const perc = attendancePercent(rec);
                if (perc < target) lowCount++;
                return `
                    <tr>
                        <td>${escapeHTML(c.name)}</td>
                        <td>${escapeHTML(c.code)}</td>
                        <td>${rec.totalClasses}</td>
                        <td>${rec.attendedClasses}</td>
                        <td>${rec.totalClasses - rec.attendedClasses}</td>
                        <td><strong>${percentageText(perc)}</strong></td>
                        <td><a href="attendance.html" class="text_link">Update</a></td>
                    </tr>
                `;
            } else {
                return `
                    <tr>
                        <td>${escapeHTML(c.name)}</td>
                        <td>${escapeHTML(c.code)}</td>
                        <td>—</td><td>—</td><td>—</td>
                        <td><span style="color:#f59e0b;">No data</span></td>
                        <td><a href="attendance.html" class="text_link">Add</a></td>
                    </tr>
                `;
            }
        }).join('');
  
        byId('detailLowAttendance').textContent = String(lowCount);
        byId('detailOverallAttendance').textContent = totClasses > 0 ? percentageText((totAtt / totClasses) * 100) : '—';
    }
  
    function initStudyTracker() {
        const form = byId('studyform');
        const tbody = byId('studyRows');
        byId('studyDate').valueAsDate = new Date();
  
        function render() {
            byId('studyrecordcount').textContent = `${data.studySessions.length} Records`;
            byId('studyempty').style.display = data.studySessions.length ? 'none' : 'block';
  
            let mins = 0, comp = 0, pend = 0;
            
            tbody.innerHTML = [...data.studySessions].reverse().map(session => {
                mins += Number(session.minutes);
                if (session.task) {
                    if (session.completed) comp++; else pend++;
                }
                const status = session.task ? (session.completed ? '✅ Done' : '⏳ Pending') : '—';
                
                return `
                    <tr>
                        <td>${escapeHTML(session.date)}</td>
                        <td><strong>${escapeHTML(session.subject)}</strong></td>
                        <td>${session.minutes} mins</td>
                        <td>${escapeHTML(session.task || '—')}</td>
                        <td>${status}</td>
                        <td>
                            ${session.task ? `<button class="button secondary" style="padding:4px 8px; font-size:0.85rem;" data-action="toggle" data-id="${escapeHTML(session.id)}">Toggle</button>` : ''}
                            <button class="button secondary" style="padding:4px 8px; font-size:0.85rem; color:#ef4444;" data-action="delete" data-id="${escapeHTML(session.id)}">Del</button>
                        </td>
                    </tr>
                `;
            }).join('');
  
            byId('totalstudyhours').textContent = `${(mins / 60).toFixed(1).replace(/\.0$/, '')} hrs`;
            byId('completedtasks').textContent = String(comp);
            byId('pendingtasks').textContent = String(pend);
        }
  
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const date = byId('studyDate').value;
            const subject = byId('studySubject').value.trim();
            const minutes = Number(byId('studyMinutes').value);
            const task = byId('studyTask').value.trim();
            const completed = byId('studyTaskComplete').checked;
            
            data.studySessions.push({ id: makeId(), date, subject, minutes, task, completed });
            saveAndRefresh(`Logged ${minutes} mins for ${subject}`);
            form.reset(); byId('studyDate').valueAsDate = new Date(); render();
        });
  
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const session = data.studySessions.find(s => s.id === btn.dataset.id);
            
            if (btn.dataset.action === 'toggle') {
                session.completed = !session.completed;
                saveAndRefresh(); render();
            } else if (btn.dataset.action === 'delete') {
                if (!window.confirm('Delete session?')) return;
                data.studySessions = data.studySessions.filter(s => s.id !== session.id);
                saveAndRefresh(); render();
            }
        });
        render();
    }
  
    function initReports() {
        const target = Number(data.settings.minimumAttendance);
        byId('reportTarget').textContent = `${target}%`;
        const tbody = byId('reportRows');
        const warnBox = byId('lowAttendanceReport');
  
        byId('reportrecordcount').textContent = `${data.attendance.length} Records`;
        byId('reportempty').style.display = data.attendance.length ? 'none' : 'block';
  
        let warningsHTML = '';
  
        tbody.innerHTML = data.attendance.map(record => {
            const s = studentById(record.studentId);
            const c = courseById(record.courseId);
            const perc = attendancePercent(record);
            const isLow = perc < target;
            
            if (isLow && s && c) {
                warningsHTML += `
                    <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:12px; margin-bottom:10px; border-radius:4px;">
                        <strong>⚠️ Action Required:</strong> ${escapeHTML(s.name)} is at ${percentageText(perc)} in ${escapeHTML(c.name)}.
                    </div>
                `;
            }
  
            return `
                <tr style="${isLow ? 'background:#fef2f2;' : ''}">
                    <td><strong>${escapeHTML(s?.name || 'Unknown')}</strong></td>
                    <td>${escapeHTML(s?.roll || '—')}</td>
                    <td>${escapeHTML(c?.name || '—')}</td>
                    <td>${record.totalClasses}</td>
                    <td>${record.attendedClasses}</td>
                    <td>${record.totalClasses - record.attendedClasses}</td>
                    <td><strong>${percentageText(perc)}</strong></td>
                    <td>${isLow ? '⚠️ Review' : '✅ Good'}</td>
                </tr>
            `;
        }).join('');
  
        if (warningsHTML) {
            warnBox.className = '';
            warnBox.innerHTML = warningsHTML;
        } else {
            warnBox.className = 'empty-state';
            warnBox.textContent = data.attendance.length ? 'Great! All student records meet the required target.' : 'No data yet.';
        }
    }
  
    function initSettings() {
        const input = byId('minimumAttendance');
        input.value = String(data.settings.minimumAttendance);
  
        byId('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const val = Number(input.value);
            if (val > 0 && val <= 100) {
                data.settings.minimumAttendance = val;
                saveAndRefresh(`Changed target attendance to ${val}%`);
            }
        });
    }
  
    // ==========================================================================
    // Bootstrapper / Router
    // ==========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        const page = document.body.dataset.page;
        
        // Due to typo in original HTML data-page:
        if (page === 'dashboard') initDashboard();
        if (page === 'students') initStudents();
        if (page === 'student-details') initStudentDetails();
        if (page === 'courses') initCourses();
        if (page === 'attendence' || page === 'attendance') initAttendance(); 
        if (page === 'study-tracker') initStudyTracker();
        if (page === 'reports') initReports();
        if (page === 'settings') initSettings();
    });
  
  })();