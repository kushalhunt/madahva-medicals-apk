// ── API base ──────────────────────────────────────────────
const API = "http://127.0.0.1:3791/api";
const SERVER_ORIGIN = API.replace(/\/api$/, "");

// ── State ─────────────────────────────────────────────────
const state = { patients: [], bills: [], appointments: [], photos: [], bookingRequests: [], meta: { lastBackupAt: "" } };
let selectedPatientId = null, selectedBillId = null, selectedAppointmentId = null;
let latestBillId = null, recognition = null, recording = false;
let photoModalPatientId = null, photoPollTimer = null;
let activeBookingId = null;

const viewTitles = { dashboard:"Dashboard", patients:"Patients", billing:"Billing", schedule:"Schedule", assistant:"AI Assistant" };

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  storageCount: document.querySelector("#storageCount"),
  backupStatus: document.querySelector("#backupStatus"),
  statPatients: document.querySelector("#statPatients"),
  statDue: document.querySelector("#statDue"),
  statOutstanding: document.querySelector("#statOutstanding"),
  todayLabel: document.querySelector("#todayLabel"),
  upcomingList: document.querySelector("#upcomingList"),
  recentList: document.querySelector("#recentList"),
  patientList: document.querySelector("#patientList"),
  patientSearch: document.querySelector("#patientSearch"),
  billPatient: document.querySelector("#billPatient"),
  appointmentPatient: document.querySelector("#appointmentPatient"),
  billList: document.querySelector("#billList"),
  appointmentList: document.querySelector("#appointmentList"),
  billPreview: document.querySelector("#billPreview"),
  qrPreview: document.querySelector("#qrPreview"),
  assistantInput: document.querySelector("#assistantInput"),
  assistantOutput: document.querySelector("#assistantOutput"),
  photoModalOverlay: document.querySelector("#photoModalOverlay"),
  photoModalPatient: document.querySelector("#photoModalPatient"),
  photoModalPatient2: document.querySelector("#photoModalPatient2"),
  photoQrImg: document.querySelector("#photoQrImg"),
  photoGrid: document.querySelector("#photoGrid"),
  photoCountPill: document.querySelector("#photoCountPill"),
  bookingBadge: document.querySelector("#bookingBadge"),
  bookingCountPill: document.querySelector("#bookingCountPill"),
  bookingRequestList: document.querySelector("#bookingRequestList"),
  bookingModalOverlay: document.querySelector("#bookingModalOverlay"),
  bookingModalSub: document.querySelector("#bookingModalSub"),
  bookingPatientSelect: document.querySelector("#bookingPatientSelect"),
  bookingDateTime: document.querySelector("#bookingDateTime"),
  bookingNotes: document.querySelector("#bookingNotes"),
};

async function apiGet(path){ const r=await fetch(`${API}${path}`); return r.json(); }
async function apiPost(path,body){ const r=await fetch(`${API}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); return r.json(); }
async function apiDelete(path){ const r=await fetch(`${API}${path}`,{method:"DELETE"}); return r.json(); }

async function loadAll(){
  try {
    const [patients,bills,appointments,photos,bookingRequests,meta] = await Promise.all([apiGet("/patients"),apiGet("/bills"),apiGet("/appointments"),apiGet("/photos"),apiGet("/booking-requests?status=pending"),apiGet("/meta")]);
    state.patients=patients; state.bills=bills; state.appointments=appointments; state.photos=photos; state.bookingRequests=bookingRequests; state.meta=meta;
  } catch(e){ console.error("Load failed",e); }
}

async function saveAndRender(){ await loadAll(); render(); }

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation(); bindForms(); bindAssistant(); bindDataTools(); setupVoiceInput(); bindPhotoModal(); bindBookingModal();
  document.querySelector("#appointmentBase").valueAsDate = new Date();
  document.querySelector("#patientVisitDate").valueAsDate = new Date();
  els.todayLabel.textContent = formatDate(new Date().toISOString());
  await loadAll(); render(); showDueNotice();
  setInterval(async () => {
    try {
      const pending = await apiGet("/booking-requests?status=pending");
      state.bookingRequests = pending;
      renderBookingRequests();
    } catch(e) { /* ignore */ }
  }, 45000);
});

function bindNavigation(){
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.jump)));
}

function showView(view){
  document.querySelectorAll(".view").forEach(el=>el.classList.remove("active"));
  document.querySelector(`#${view}`).classList.add("active");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  els.viewTitle.textContent = viewTitles[view]||"Madhava Clinic";
}

function bindForms(){
  document.querySelector("#patientForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const existing = selectedPatientId ? findPatient(selectedPatientId) : null;
    const visit = { id:crypto.randomUUID(), date:value("#patientVisitDate")||toDateInput(new Date()), diagnosis:value("#patientDiagnosis"), symptoms:value("#patientSymptoms"), vitals:value("#patientVitals"), medicines:value("#patientMedicines"), notes:value("#patientNotes"), createdAt:new Date().toISOString() };
    const patient = { id:selectedPatientId||crypto.randomUUID(), patientCode:existing?existing.patientCode:nextPatientCode(), name:value("#patientName"), age:value("#patientAge"), phone:normalizePhone(value("#patientPhone")), gender:value("#patientGender"), address:value("#patientAddress"), allergies:value("#patientAllergies"), currentMedicines:value("#patientMedicines"), diagnosis:value("#patientDiagnosis"), symptoms:value("#patientSymptoms"), notes:value("#patientNotes"), visits:[...(existing?.visits||[]),visit].filter(hasVisitContent), createdAt:existing?existing.createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    await apiPost("/patients",patient);
    selectedPatientId=null; e.target.reset();
    document.querySelector("#patientVisitDate").valueAsDate=new Date();
    await saveAndRender();
  });

  document.querySelector("#billForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const patient=findPatient(value("#billPatient")); if(!patient)return;
    const bill={ id:selectedBillId||crypto.randomUUID(), patientId:patient.id, patientName:patient.name, consultation:number("#billConsultation"), medicines:number("#billMedicines"), tests:number("#billTests"), discount:number("#billDiscount"), paid:number("#billPaid"), paymentMode:value("#billPaymentMode"), notes:value("#billNotes"), createdAt:selectedBillId?findBill(selectedBillId).createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    bill.total=bill.consultation+bill.medicines+bill.tests-bill.discount;
    bill.balance=Math.max(0,bill.total-bill.paid); bill.status=getBillStatus(bill);
    await apiPost("/bills",bill);
    latestBillId=bill.id; selectedBillId=null; e.target.reset();
    document.querySelector("#billConsultation").value=500;
    ["#billMedicines","#billTests","#billDiscount","#billPaid"].forEach(id=>document.querySelector(id).value=0);
    await saveAndRender();
  });

  document.querySelector("#appointmentForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const patient=findPatient(value("#appointmentPatient")); if(!patient)return;
    const base=parseDateInput(value("#appointmentBase")); base.setDate(base.getDate()+number("#appointmentDays"));
    const existing=selectedAppointmentId?findAppointment(selectedAppointmentId):null;
    const appointment={ id:selectedAppointmentId||crypto.randomUUID(), patientId:patient.id, patientName:patient.name, phone:patient.phone, days:number("#appointmentDays"), date:toDateInput(base), reason:value("#appointmentReason")||"Follow-up consultation", done:existing?existing.done:false, createdAt:existing?existing.createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    await apiPost("/appointments",appointment);
    selectedAppointmentId=null; e.target.reset();
    document.querySelector("#appointmentBase").valueAsDate=new Date();
    await saveAndRender();
  });

  ["#billConsultation","#billMedicines","#billTests","#billDiscount"].forEach(id=>document.querySelector(id).addEventListener("input",updateBillPreview));
  document.querySelector("#billPaymentMode").addEventListener("change",updateQrPreview);
  els.patientSearch.addEventListener("input",renderPatients);
  document.querySelector("#printBillBtn").addEventListener("click",printLatestBill);
  document.querySelector("#notifyBtn").addEventListener("click",enableNotifications);
  document.querySelector("#aiPatientBtn").addEventListener("click",fillPatientSummary);
  document.querySelector("#aiBillBtn").addEventListener("click",fillBillNote);
}

function bindAssistant(){
  document.querySelector("#summarizeBtn").addEventListener("click",()=>{ els.assistantOutput.textContent=makeSummary(els.assistantInput.value); });
  document.querySelector("#followupBtn").addEventListener("click",()=>{ els.assistantOutput.textContent=makeFollowup(els.assistantInput.value); });
  document.querySelector("#whatsappDraftBtn").addEventListener("click",()=>{ els.assistantOutput.textContent=makeWhatsAppDraft(els.assistantInput.value); });
}

function bindDataTools(){
  document.querySelector("#exportBtn").addEventListener("click",async()=>{
    const now=new Date().toISOString(); await apiPost("/meta",{lastBackupAt:now}); state.meta.lastBackupAt=now;
    downloadFile(`madhava-backup-${toDateInput(new Date())}.json`,JSON.stringify(state,null,2),"application/json"); renderStats();
  });
  document.querySelector("#excelBtn").addEventListener("click",async()=>{
    const now=new Date().toISOString(); await apiPost("/meta",{lastBackupAt:now}); state.meta.lastBackupAt=now; downloadExcel(); renderStats();
  });
  document.querySelector("#importInput").addEventListener("change",async e=>{
    const file=e.target.files[0]; if(!file)return;
    const imported=JSON.parse(await file.text());
    await apiPost("/import",{ patients:Array.isArray(imported.patients)?imported.patients:[], bills:Array.isArray(imported.bills)?imported.bills:[], appointments:Array.isArray(imported.appointments)?imported.appointments:[], meta:imported.meta||{} });
    e.target.value=""; await saveAndRender();
  });
}

function setupVoiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=document.querySelector("#recordBtn");
  if(!SR){ btn.textContent="Voice unavailable"; btn.disabled=true; return; }
  recognition=new SR(); recognition.continuous=true; recognition.interimResults=true; recognition.lang="en-IN";
  recognition.onresult=e=>{ const text=Array.from(e.results).slice(e.resultIndex).map(r=>r[0].transcript).join(" "); const field=document.querySelector("#patientNotes"); field.value=`${field.value} ${text}`.trim(); };
  recognition.onend=()=>{ recording=false; btn.textContent="Start voice note"; };
  btn.addEventListener("click",()=>{ recording=!recording; if(recording){ recognition.start(); btn.textContent="Stop voice note"; } else recognition.stop(); });
}

function render(){ renderStats(); renderSelects(); renderPatients(); renderBills(); renderAppointments(); renderDashboardLists(); renderBookingRequests(); updateBillPreview(); updateQrPreview(); }

function renderStats(){
  const due=getDueAppointments(), outstanding=state.bills.reduce((s,b)=>s+(b.balance||0),0);
  els.statPatients.textContent=state.patients.length;
  if(els.statDue) els.statDue.textContent=due.length;
  if(els.statOutstanding) els.statOutstanding.textContent=rupees(outstanding);
  els.storageCount.textContent=`${state.patients.length+state.bills.length+state.appointments.length} records`;
  els.backupStatus.textContent=backupStatusText();
}

function renderSelects(){
  const opts=state.patients.map(p=>`<option value="${p.id}">${escapeHtml(p.patientCode)} - ${escapeHtml(p.name)} - ${escapeHtml(p.phone)}</option>`).join("");
  els.billPatient.innerHTML=opts||"<option value=''>Add a patient first</option>";
  els.appointmentPatient.innerHTML=opts||"<option value=''>Add a patient first</option>";
}

function renderPatients(){
  const term=els.patientSearch.value.trim().toLowerCase();
  const list=state.patients.filter(p=>[p.patientCode,p.name,p.phone,p.diagnosis,p.allergies,p.currentMedicines,p.symptoms,p.notes].join(" ").toLowerCase().includes(term));
  renderList(els.patientList,list,p=>`
    <article class="record">
      <div class="record-head"><div><h4>${escapeHtml(p.name)}</h4><p>Patient ID: ${escapeHtml(p.patientCode)}</p><p>${escapeHtml(p.phone)}${p.age?`, ${escapeHtml(p.age)} years`:""}${p.gender?`, ${escapeHtml(p.gender)}`:""}</p></div><span class="pill">${formatDate(p.updatedAt)}</span></div>
      <div class="pill-row">${p.diagnosis?`<span class="pill">${escapeHtml(p.diagnosis)}</span>`:""}${p.allergies?`<span class="pill due">Allergy: ${escapeHtml(p.allergies)}</span>`:""}${p.symptoms?`<span class="pill">Symptoms recorded</span>`:""}${p.notes?`<span class="pill">Notes saved</span>`:""}${photoCount(p.id)?`<span class="pill photo-count-pill">${photoCount(p.id)} photo${photoCount(p.id)===1?"":"s"}</span>`:""}</div>
      <p>${escapeHtml(p.symptoms||"No symptoms added.")}</p>
      ${p.currentMedicines?`<p>Medicines: ${escapeHtml(p.currentMedicines)}</p>`:""}
      ${renderVisitHistory(p)}
      <div class="record-actions"><a href="${whatsappLink(p.phone,patientReminderText(p))}" target="_blank" rel="noreferrer">WhatsApp</a><button data-photos-patient="${p.id}">Photos${photoCount(p.id)?` (${photoCount(p.id)})`:""}</button><button data-edit-patient="${p.id}">Edit</button><button data-delete-patient="${p.id}">Delete</button></div>
    </article>`);
  els.patientList.querySelectorAll("[data-edit-patient]").forEach(b=>b.addEventListener("click",()=>editPatient(b.dataset.editPatient)));
  els.patientList.querySelectorAll("[data-delete-patient]").forEach(b=>b.addEventListener("click",()=>deletePatient(b.dataset.deletePatient)));
  els.patientList.querySelectorAll("[data-photos-patient]").forEach(b=>b.addEventListener("click",()=>openPhotoModal(b.dataset.photosPatient)));
}

function photoCount(patientId){ return state.photos.filter(ph=>ph.patientId===patientId).length; }

function renderBills(){
  renderList(els.billList,state.bills,b=>`
    <article class="record">
      <div class="record-head"><div><h4>${escapeHtml(b.patientName)}</h4><p>${escapeHtml(findPatient(b.patientId)?.patientCode||"No ID")} - ${formatDate(b.createdAt)} - Total ${rupees(b.total)} - Balance ${rupees(b.balance)} - ${escapeHtml(b.paymentMode||"QR")}</p></div><span class="pill ${b.status==="Paid"?"paid":"due"}">${escapeHtml(b.status)}</span></div>
      <p>${escapeHtml(b.notes||"No bill notes.")}</p>
      <div class="record-actions"><a href="${whatsappLink(findPatient(b.patientId)?.phone,billMessage(b))}" target="_blank" rel="noreferrer">Send bill</a><button data-edit-bill="${b.id}">Edit</button><button data-delete-bill="${b.id}">Delete</button></div>
    </article>`);
  els.billList.querySelectorAll("[data-edit-bill]").forEach(b=>b.addEventListener("click",()=>editBill(b.dataset.editBill)));
  els.billList.querySelectorAll("[data-delete-bill]").forEach(b=>b.addEventListener("click",async()=>{ if(!confirm("Delete this bill?"))return; await apiDelete(`/bills/${b.dataset.deleteBill}`); await saveAndRender(); }));
}

function renderAppointments(){
  const sorted=[...state.appointments].sort((a,b)=>a.date.localeCompare(b.date));
  renderList(els.appointmentList,sorted,a=>`
    <article class="record">
      <div class="record-head"><div><h4>${escapeHtml(a.patientName)}</h4><p>${escapeHtml(findPatient(a.patientId)?.patientCode||"No ID")} - ${formatDate(a.date)} - ${escapeHtml(a.reason)}</p></div><span class="pill ${isDue(a)?"due":a.done?"paid":""}">${a.done?"Done":isDue(a)?"Due":`${a.days} days`}</span></div>
      <div class="record-actions"><a href="${whatsappLink(a.phone,appointmentMessage(a))}" target="_blank" rel="noreferrer">WhatsApp alert</a><button data-edit-appointment="${a.id}">Edit</button><button data-toggle-appointment="${a.id}">${a.done?"Reopen":"Mark done"}</button><button data-delete-appointment="${a.id}">Delete</button></div>
    </article>`);
  els.appointmentList.querySelectorAll("[data-toggle-appointment]").forEach(b=>b.addEventListener("click",async()=>{ const item=findAppointment(b.dataset.toggleAppointment); if(!item)return; item.done=!item.done; item.updatedAt=new Date().toISOString(); await apiPost("/appointments",item); await saveAndRender(); }));
  els.appointmentList.querySelectorAll("[data-edit-appointment]").forEach(b=>b.addEventListener("click",()=>editAppointment(b.dataset.editAppointment)));
  els.appointmentList.querySelectorAll("[data-delete-appointment]").forEach(b=>b.addEventListener("click",async()=>{ if(!confirm("Delete this appointment?"))return; await apiDelete(`/appointments/${b.dataset.deleteAppointment}`); await saveAndRender(); }));
}

function renderDashboardLists(){
  const upcoming=[...state.appointments].filter(a=>!a.done).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  if(els.upcomingList) renderList(els.upcomingList,upcoming,a=>`<article class="record"><div class="record-head"><div><h4>${escapeHtml(a.patientName)}</h4><p>${escapeHtml(findPatient(a.patientId)?.patientCode||"No ID")} - ${formatDate(a.date)} - ${escapeHtml(a.reason)}</p></div><span class="pill ${isDue(a)?"due":""}">${isDue(a)?"Due":"Upcoming"}</span></div></article>`);
  renderList(els.recentList,state.patients.slice(0,5),p=>`<article class="record"><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.patientCode)} - ${escapeHtml(p.phone)} - ${escapeHtml(p.symptoms||"No symptoms added.")}</p></article>`);
}

function renderList(container,items,template){
  if(!items||!items.length){ container.innerHTML=document.querySelector("#emptyTemplate").innerHTML; return; }
  container.innerHTML=items.map(template).join("");
}

function renderVisitHistory(patient){
  const visits=[...(patient.visits||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
  if(!visits.length)return "";
  return `<div class="visit-history"><strong>Visit history</strong>${visits.map(v=>`<div class="visit-item"><span>${formatDate(v.date)}</span><p>${escapeHtml([v.diagnosis,v.vitals,v.symptoms,v.notes].filter(Boolean).join(" - ")||"Visit saved.")}</p></div>`).join("")}</div>`;
}

function editPatient(id){ const p=findPatient(id); if(!p)return; selectedPatientId=id; setValue("#patientName",p.name); setValue("#patientAge",p.age); setValue("#patientPhone",p.phone); setValue("#patientGender",p.gender); setValue("#patientAddress",p.address); setValue("#patientVisitDate",toDateInput(new Date())); setValue("#patientVitals",""); setValue("#patientAllergies",p.allergies); setValue("#patientMedicines",p.currentMedicines); setValue("#patientDiagnosis",p.diagnosis); setValue("#patientSymptoms",p.symptoms); setValue("#patientNotes",p.notes); showView("patients"); window.scrollTo({top:0,behavior:"smooth"}); }
function editBill(id){ const b=findBill(id); if(!b)return; selectedBillId=id; setValue("#billPatient",b.patientId); setValue("#billConsultation",b.consultation); setValue("#billMedicines",b.medicines); setValue("#billTests",b.tests); setValue("#billDiscount",b.discount); setValue("#billPaid",b.paid); setValue("#billPaymentMode",b.paymentMode||"QR"); setValue("#billNotes",b.notes); updateBillPreview(); showView("billing"); window.scrollTo({top:0,behavior:"smooth"}); }
function editAppointment(id){ const a=findAppointment(id); if(!a)return; selectedAppointmentId=id; const base=parseDateInput(a.date); base.setDate(base.getDate()-Number(a.days||0)); setValue("#appointmentPatient",a.patientId); setValue("#appointmentBase",toDateInput(base)); setValue("#appointmentDays",a.days); setValue("#appointmentReason",a.reason); showView("schedule"); window.scrollTo({top:0,behavior:"smooth"}); }
async function deletePatient(id){ if(!confirm("Delete this patient and related bills/appointments?"))return; await apiDelete(`/patients/${id}`); await saveAndRender(); }

// ── Website Booking Requests ────────────────────────────────

function renderBookingRequests(){
  const pending = state.bookingRequests.filter(b=>b.status==="pending");
  if(els.bookingCountPill) els.bookingCountPill.textContent = pending.length;
  if(els.bookingBadge){
    els.bookingBadge.style.display = pending.length ? "inline-flex" : "none";
    els.bookingBadge.textContent = pending.length;
  }
  if(!els.bookingRequestList) return;
  els.bookingRequestList.innerHTML = pending.length ? pending.map(b=>`
    <article class="booking-request">
      <h4>${escapeHtml(b.name)}</h4>
      <p>${escapeHtml(b.phone)}${b.age?`, ${escapeHtml(String(b.age))} yrs`:""}</p>
      <p>${escapeHtml(b.reason||"No reason given")}${b.requestedDateTime?` · Wants: ${formatDateTime(b.requestedDateTime)}`:""}</p>
      ${b.message?`<p>"${escapeHtml(b.message)}"</p>`:""}
      <div class="toolbar">
        <button class="secondary" data-dismiss-booking="${b.id}">Dismiss</button>
        <button data-accept-booking="${b.id}">Review &amp; confirm</button>
      </div>
    </article>`).join("") : `<div class="empty">No new website bookings right now.</div>`;

  els.bookingRequestList.querySelectorAll("[data-accept-booking]").forEach(b=>b.addEventListener("click",()=>openBookingModal(b.dataset.acceptBooking)));
  els.bookingRequestList.querySelectorAll("[data-dismiss-booking]").forEach(b=>b.addEventListener("click",()=>dismissBooking(b.dataset.dismissBooking)));
}

function bindBookingModal(){
  document.querySelector("#closeBookingModal").addEventListener("click",closeBookingModal);
  els.bookingModalOverlay.addEventListener("click",e=>{ if(e.target===els.bookingModalOverlay) closeBookingModal(); });
  document.querySelector("#bookingDismissBtn").addEventListener("click",async()=>{
    if(!activeBookingId) return;
    await dismissBooking(activeBookingId);
    closeBookingModal();
  });
  document.querySelector("#bookingConfirmBtn").addEventListener("click",confirmBooking);
}

function openBookingModal(id){
  const booking = state.bookingRequests.find(b=>b.id===id);
  if(!booking) return;
  activeBookingId = id;
  els.bookingModalSub.textContent = `${booking.name} · ${booking.phone}`;

  const normPhone = normalizePhone(booking.phone);
  const match = normPhone ? state.patients.find(p=>normalizePhone(p.phone)===normPhone) : null;
  const opts = [
    `<option value="__new__">+ Create new patient (${escapeHtml(booking.name)})</option>`,
    ...state.patients.map(p=>`<option value="${p.id}">${escapeHtml(p.patientCode)} - ${escapeHtml(p.name)} - ${escapeHtml(p.phone)}</option>`)
  ];
  els.bookingPatientSelect.innerHTML = opts.join("");
  els.bookingPatientSelect.value = match ? match.id : "__new__";

  els.bookingDateTime.value = toDateTimeLocalInput(booking.requestedDateTime);
  els.bookingNotes.value = [booking.reason, booking.message].filter(Boolean).join(" — ");
  els.bookingModalOverlay.classList.add("active");
}

function closeBookingModal(){
  els.bookingModalOverlay.classList.remove("active");
  activeBookingId = null;
}

async function dismissBooking(id){
  await apiPost(`/booking-requests/${id}/dismiss`, {});
  await saveAndRender();
}

async function confirmBooking(){
  if(!activeBookingId) return;
  const booking = state.bookingRequests.find(b=>b.id===activeBookingId);
  if(!booking) return;

  const dateTimeValue = els.bookingDateTime.value;
  if(!dateTimeValue){ alert("Pick an appointment date & time."); return; }
  const [datePart, timePart] = dateTimeValue.split("T");
  const notesText = els.bookingNotes.value.trim();
  const notes = timePart ? `${notesText}${notesText?" ":""}(Requested time: ${timePart})` : notesText;

  const body = { appointmentDate: datePart, notes };
  const selected = els.bookingPatientSelect.value;
  if(selected === "__new__"){
    body.newPatient = { name: booking.name, phone: normalizePhone(booking.phone), age: booking.age, patientCode: nextPatientCode() };
  } else {
    body.patientId = selected;
  }

  await apiPost(`/booking-requests/${activeBookingId}/accept`, body);
  closeBookingModal();
  await saveAndRender();
}

function toDateTimeLocalInput(v){
  if(!v) return "";
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.slice(0,16);
  const d = new Date(v);
  if(isNaN(d)) return "";
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(v){
  try{ return new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v)); }
  catch(e){ return v; }
}

// ── Patient Photos (QR upload) ─────────────────────────────

function bindPhotoModal(){
  document.querySelector("#closePhotoModal").addEventListener("click",closePhotoModal);
  els.photoModalOverlay.addEventListener("click",e=>{ if(e.target===els.photoModalOverlay) closePhotoModal(); });
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closePhotoModal(); });
}

async function openPhotoModal(patientId){
  const patient=findPatient(patientId); if(!patient)return;
  photoModalPatientId=patientId;
  els.photoModalPatient.textContent=`${patient.name} · ${patient.patientCode}`;
  els.photoModalPatient2.textContent=patient.name;
  els.photoQrImg.src="";
  els.photoModalOverlay.classList.add("active");

  try{
    const qr=await apiGet(`/patients/${patientId}/qr`);
    if(photoModalPatientId===patientId) els.photoQrImg.src=qr.dataUrl;
  }catch(e){ console.error("QR load failed",e); }

  await refreshPhotoGrid(patientId);
  clearInterval(photoPollTimer);
  photoPollTimer=setInterval(()=>refreshPhotoGrid(patientId),3000);
}

function closePhotoModal(){
  els.photoModalOverlay.classList.remove("active");
  photoModalPatientId=null;
  clearInterval(photoPollTimer);
}

async function refreshPhotoGrid(patientId){
  if(photoModalPatientId!==patientId)return;
  let photos=[];
  try{ photos=await apiGet(`/photos?patientId=${encodeURIComponent(patientId)}`); }catch(e){ return; }
  if(photoModalPatientId!==patientId)return;

  const existingIds=new Set(state.photos.filter(p=>p.patientId===patientId).map(p=>p.id));
  const newIds=new Set(photos.map(p=>p.id));
  const changed=existingIds.size!==newIds.size||[...newIds].some(id=>!existingIds.has(id));

  state.photos=[...state.photos.filter(p=>p.patientId!==patientId),...photos];
  els.photoCountPill.textContent=photos.length;
  els.photoGrid.innerHTML=photos.length?photos.map(p=>{
    const url=`${SERVER_ORIGIN}/photos/${encodeURIComponent(p.patientId)}/${encodeURIComponent(p.filename)}`;
    return `<div class="photo-thumb">
      <img src="${url}" data-full="${url}" />
      <button data-delete-photo="${p.id}" title="Delete photo">✕</button>
    </div>`;
  }).join(""):`<div class="empty">No photos yet. Scan the QR code from a phone to add some.</div>`;

  els.photoGrid.querySelectorAll("img").forEach(img=>img.addEventListener("click",()=>window.open(img.dataset.full,"_blank")));
  els.photoGrid.querySelectorAll("[data-delete-photo]").forEach(b=>b.addEventListener("click",async()=>{
    if(!confirm("Delete this photo?"))return;
    await apiDelete(`/photos/${b.dataset.deletePhoto}`);
    await refreshPhotoGrid(patientId);
  }));

  if(changed) renderPatients();
}

function updateBillPreview(){ els.billPreview.textContent=rupees(Math.max(0,number("#billConsultation")+number("#billMedicines")+number("#billTests")-number("#billDiscount"))); }
function updateQrPreview(){ els.qrPreview.classList.toggle("hidden",value("#billPaymentMode")!=="QR"); }

function printLatestBill(){
  const bill=state.bills.find(b=>b.id===latestBillId)||state.bills[0]; if(!bill)return;
  const w=window.open("","_blank");
  w.document.write(`<title>Invoice</title><style>body{font-family:Georgia,serif;padding:32px;color:#1a1a18;background:#f7f5ef;}h1{color:#1e3d1e;margin:0 0 4px;}.sub{color:#7a7a6e;font-size:13px;margin-bottom:20px;}.box{border:1px solid #e2dfd6;border-radius:8px;padding:20px;margin-top:18px;background:#fff;}h2{margin:0 0 12px;color:#1e3d1e;}p{line-height:1.6;margin:4px 0;}.total{font-size:20px;font-weight:700;color:#1a1a18;margin-top:12px;}</style><h1>Madhava Clinic</h1><div class="sub">Invoice · ${formatDate(bill.createdAt)}</div><div class="box"><h2>${escapeHtml(bill.patientName)}</h2><p>Consultation: ${rupees(bill.consultation)}</p><p>Medicines: ${rupees(bill.medicines)}</p><p>Tests: ${rupees(bill.tests)}</p><p>Discount: ${rupees(bill.discount)}</p><div class="total">Total: ${rupees(bill.total)}</div><p>Paid: ${rupees(bill.paid)} | Balance: ${rupees(bill.balance)}</p><p>Status: ${escapeHtml(bill.status)} | Payment: ${escapeHtml(bill.paymentMode||"QR")}</p>${(bill.paymentMode||"QR")==="QR"?'<img src="qr.jpeg" alt="QR" style="width:220px;background:#111;padding:12px;margin-top:12px;border-radius:6px;">':""}<p style="margin-top:12px;color:#7a7a6e;">${escapeHtml(bill.notes||"")}</p></div>`);
  w.document.close(); w.print();
}

function enableNotifications(){ if(!("Notification"in window))return; Notification.requestPermission().then(p=>{ if(p==="granted"){ const due=getDueAppointments(); if(due.length) new Notification("Madhava Clinic",{body:`${due.length} appointment reminder is due.`}); } }); }
function showDueNotice(){ const due=getDueAppointments(); if(due.length&&"Notification"in window&&Notification.permission==="granted") new Notification("Madhava Clinic",{body:`${due.length} patient follow-up is due today.`}); }

function fillPatientSummary(){ setValue("#patientNotes",makeSummary(`${value("#patientSymptoms")}\n${value("#patientNotes")}`)); }
function fillBillNote(){ const p=findPatient(value("#billPatient")); const total=number("#billConsultation")+number("#billMedicines")+number("#billTests")-number("#billDiscount"); setValue("#billNotes",`Bill prepared for ${p?.name||"patient"}. Total amount is ${rupees(Math.max(0,total))}. Please clear pending balance at the clinic or during the next visit.`); }

function makeSummary(text){ const clean=text.trim(); if(!clean)return "Add patient details or notes first."; const sentences=clean.split(/[.\n]/).map(l=>l.trim()).filter(Boolean); const keywords=extractKeywords(clean); return ["Clinical summary:",sentences.slice(0,3).map(l=>`- ${l}`).join("\n"),"",`Important terms: ${keywords.join(", ")||"not enough detail"}.`,"Suggested next step: confirm vitals, review current medicines, and schedule a 10, 20, or 30 day follow-up based on severity."].join("\n"); }
function makeFollowup(text){ const keywords=extractKeywords(text); const hasPain=/pain|fever|cough|infection|sugar|bp|pressure/i.test(text); return ["Follow-up plan:",`- Review in ${hasPain?"10":"20"} days.`,"- Ask patient to report worsening symptoms immediately.","- Carry previous prescription and test reports.",keywords.length?`- Track: ${keywords.slice(0,5).join(", ")}.`:"- Add key symptoms for a more specific plan."].join("\n"); }
function makeWhatsAppDraft(text){ const first=text.trim().split(/[.\n]/).find(Boolean)||"your scheduled follow-up"; return `Hello, this is a reminder from Madhava Clinic regarding ${first}. Please confirm your availability for the appointment.`; }
function extractKeywords(text){ const stop=new Set("the and for with this that from patient notes medicine tablet daily twice once after before appointment follow clinic".split(" ")); return[...new Set(text.toLowerCase().match(/[a-z]{4,}/g)||[])].filter(w=>!stop.has(w)).slice(0,8); }

function getBillStatus(b){ if(b.balance===0)return "Paid"; if(b.balance>0&&b.paid>0)return "Partial"; return "Pending"; }
function getDueAppointments(){ const today=toDateInput(new Date()); return state.appointments.filter(a=>!a.done&&a.date<=today); }
function isDue(a){ return !a.done&&a.date<=toDateInput(new Date()); }
function findPatient(id){ return state.patients.find(p=>p.id===id); }
function findBill(id){ return state.bills.find(b=>b.id===id); }
function findAppointment(id){ return state.appointments.find(a=>a.id===id); }

function nextPatientCode(){ const year=new Date().getFullYear(); const prefix=`CL-${year}-`; const used=new Set(state.patients.map(p=>p.patientCode).filter(c=>String(c||"").startsWith(prefix)).map(c=>Number(String(c).replace(prefix,""))).filter(Number.isFinite)); let next=1; while(used.has(next))next++; return `${prefix}${String(next).padStart(4,"0")}`; }
function hasVisitContent(v){ return Boolean([v.diagnosis,v.symptoms,v.vitals,v.medicines,v.currentMedicines,v.notes].join("").trim()); }
function backupStatusText(){ if(!state.meta.lastBackupAt)return "No backup yet"; const last=new Date(state.meta.lastBackupAt); const days=Math.floor((Date.now()-last.getTime())/86400000); if(days>=7)return `Backup due - last ${formatDate(last)}`; if(days===0)return "Backed up today"; return `Last backup ${days} day${days===1?"":"s"} ago`; }
function downloadFile(filename,content,type){ const blob=new Blob([content],{type}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=filename; link.click(); URL.revokeObjectURL(link.href); }

function downloadExcel(){
  const patientRows=state.patients.map(p=>({ "Patient ID":p.patientCode,Name:p.name,Age:p.age,Phone:p.phone,Gender:p.gender,Address:p.address,Allergies:p.allergies,"Current Medicines":p.currentMedicines,Diagnosis:p.diagnosis,Symptoms:p.symptoms,Notes:p.notes,"Total Visits":(p.visits||[]).length }));
  const visitRows=state.patients.flatMap(p=>(p.visits||[]).map(v=>({ "Patient ID":p.patientCode,Name:p.name,Date:v.date,Diagnosis:v.diagnosis,Vitals:v.vitals,Symptoms:v.symptoms,Medicines:v.medicines,Notes:v.notes })));
  const billRows=state.bills.map(b=>({ "Patient ID":findPatient(b.patientId)?.patientCode||"",Name:b.patientName,Date:toDateInput(b.createdAt),Total:b.total,Paid:b.paid,Balance:b.balance,Status:b.status,"Payment Mode":b.paymentMode||"QR",Notes:b.notes }));
  const apptRows=state.appointments.map(a=>({ "Patient ID":findPatient(a.patientId)?.patientCode||"",Name:a.patientName,Phone:a.phone,Date:a.date,Days:a.days,Reason:a.reason,Done:a.done?"Yes":"No" }));
  const html=`<html><head><meta charset="UTF-8"></head><body>${excelTable("Patients",patientRows)}${excelTable("Visits",visitRows)}${excelTable("Bills",billRows)}${excelTable("Appointments",apptRows)}</body></html>`;
  downloadFile(`madhava-excel-${toDateInput(new Date())}.xls`,html,"application/vnd.ms-excel");
}

function excelTable(title,rows){ const headers=rows.length?Object.keys(rows[0]):["No records"]; return `<h2>${escapeHtml(title)}</h2><table border="1"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${headers.map(h=>`<td>${escapeHtml(r[h])}</td>`).join("")}</tr>`).join(""):"<tr><td>No records</td></tr>"}</tbody></table>`; }

function value(s){ return document.querySelector(s).value.trim(); }
function setValue(s,v){ document.querySelector(s).value=v||""; }
function number(s){ return Number(document.querySelector(s).value)||0; }
function normalizePhone(p){ return String(p||"").replace(/[^\d]/g,""); }
function rupees(n){ return `Rs ${Math.round(Number(n)||0).toLocaleString("en-IN")}`; }
function toDateInput(date){ const d=new Date(date); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function parseDateInput(v){ const [y,m,d]=String(v).split("-").map(Number); return new Date(y,m-1,d); }
function formatDate(date){ if(!date)return "--"; return new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(date)); }
function escapeHtml(v){ return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function whatsappLink(phone,text){ return `https://wa.me/${normalizePhone(phone||"")}?text=${encodeURIComponent(text)}`; }
function patientReminderText(p){ return `Hello ${p.name}, this is a reminder from Madhava Clinic about your follow-up. Please reply to confirm your appointment.`; }
function appointmentMessage(a){ return `Hello ${a.patientName}, reminder for your clinic appointment on ${formatDate(a.date)} for ${a.reason}. Please reply to confirm.`; }
function billMessage(b){ return `Hello ${b.patientName}, your Madhava Clinic bill total is ${rupees(b.total)}. Paid: ${rupees(b.paid)} by ${b.paymentMode||"QR"}. Balance: ${rupees(b.balance)}.`; }
