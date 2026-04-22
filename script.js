// URL Web App GAS Anda (TIDAK PERLU DIGANTI LAGI)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwEWwtCK38c6H8GqALfkFmpXULfkXSHu0XffEbXOl3zahzLz86hkn9UYWd1YzZkj6EK/exec';
let dataTableRekapan, dataTableMaster, dataTableLogs;
let globalLogs = [], rawDataPegawai = [], systemLogsData = [];
let globalHariEfektifBulanan = {};
let chartAll, chartPersonal;
let isRekapanLoaded = false, isLogsLoaded = false;

// Fungsi untuk melakukan Hashing PIN
async function hashPIN(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CORRECT_PIN_HASH = "cd4b0bba7f67328dcff29180fb217d06f0d3a43a95ed32d175797b60e3216f83";

async function checkAccessPin() {
  // Cek apakah admin sudah login di sesi ini (sesi hilang jika tab/browser ditutup)
  if (sessionStorage.getItem('admin_authenticated') === 'true') {
      initUI();
      loadDataServer(); 
      return;
  }

  const { value: pin } = await Swal.fire({
      title: '<h3 style="color: #0f172a; margin: 0;"><i class="fas fa-shield-alt text-primary"></i> Keamanan Admin</h3>',
      html: '<p style="font-size:0.9rem; color:#64748b; margin-top:5px;">Masukkan 6 digit PIN akses Administrator.</p>',
      input: 'password',
      inputPlaceholder: '******',
      inputAttributes: {
          maxlength: 6,
          autocapitalize: 'off',
          autocorrect: 'off',
          style: 'text-align: center; font-size: 1.5rem; letter-spacing: 10px; border-radius: 12px;'
      },
      allowOutsideClick: false,
      allowEscapeKey: false,
      confirmButtonText: '<i class="fas fa-unlock-alt me-2"></i> Buka Akses',
      confirmButtonColor: '#0d6efd',
      preConfirm: async (enteredPin) => {
          if (!enteredPin) {
              Swal.showValidationMessage('<i class="fas fa-exclamation-circle"></i> PIN tidak boleh kosong!');
              return false;
          }
          
          // Hash PIN yang diketik dan hapus spasi tersembunyi
          const hashedPin = await hashPIN(enteredPin.trim());
          
          if (hashedPin !== CORRECT_PIN_HASH) {
              Swal.showValidationMessage('<i class="fas fa-exclamation-triangle"></i> PIN salah! Akses ditolak.');
              return false;
          }
          return true;
      }
  });

  // Jika PIN Benar
  if (pin) {
      sessionStorage.setItem('admin_authenticated', 'true');
      Swal.fire({
          icon: 'success',
          title: 'Akses Diberikan',
          text: 'Selamat datang di Panel Admin',
          timer: 1500,
          showConfirmButton: false
      });
      
      // Baru inisialisasi UI dan Tarik Data setelah PIN Benar
      initUI();
      loadDataServer();
  }
}

// Inisialisasi awal saat halaman dimuat (Verifikasi PIN terlebih dahulu)
$(document).ready(function() {
  checkAccessPin();
});

// Toggle sidebar (buka/tutup) saat klik hamburger
$('#sidebarCollapse').on('click', function() {
    $('#sidebar').toggleClass('active');
    $('.sidebar-overlay').toggleClass('active');
});

// Tutup sidebar saat klik tombol X
$('#closeSidebar').on('click', function(e) {
    e.preventDefault();
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

// Tutup sidebar saat klik overlay
$('#sidebarOverlay').on('click', function() {
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

// Tutup sidebar otomatis saat klik menu (khusus mobile)
$('.sidebar-link').on('click', function() {
    if ($(window).width() <= 768) {
        $('#sidebar').removeClass('active');
        $('.sidebar-overlay').removeClass('active');
    }
});
// ==========================================
// INISIALISASI UI & SIDEBAR NAVIGATION
// ==========================================
function initUI() {
    document.getElementById('tanggal').valueAsDate = new Date();
    document.getElementById('tanggalMassal').valueAsDate = new Date();
    
    let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    $('#filterBulanRekapan, #selectBulanGlobal, #selectBulanGrafik').val(currentMonth);
    $('#filterBulanUM').val(currentMonth).trigger('change');
    $('#selectGrafikPegawai').select2({ placeholder: "Ketik nama untuk mencari...", allowClear: true, width: '100%' });
    $('#selectGrafikPegawai').on('change', updateChartPegawai);
    $('#nama').select2({ placeholder: "Pilih Pegawai...", width: '100%' });

    // --- TAMBAHKAN BARIS INI ---
    initInputBayar(); 
    initBesaranUM();
    // ---------------------------

    $('#filterBulanUM').on('change', function() {
        loadDataServer(false);
    });
    $('#filterBulanUM').on('change', function() {
        renderRekapanUangMakan();
    });
    $('.sidebar-link').on('click', function(e) {
        e.preventDefault();
        let target = $(this).data('target');
        $('.sidebar-link').removeClass('active');
        $(this).addClass('active');
        $('#pageTitle').text($(this).text().trim());
        $('.content-section').hide();
        $('#' + target).fadeIn(300);
    });
}

// ==========================================
// CORE DATA FETCHING (API CALLS)
// ==========================================
function initData() {
  loadDataServer();
  setInterval(function() { loadDataServer(true); }, 60000);
}

async function fetchPost(action, payload) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Menghindari block CORS
      body: JSON.stringify({ action: action, data: payload })
    });
    return await response.json();
  } catch (error) { throw new Error('Gagal terhubung ke server.'); }
}

function setDatabaseStatus(status) {
  const badge = document.getElementById('dbStatusBadge');
  if (status === 'connecting') {
    badge.className = 'badge bg-warning text-dark px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-circle-notch fa-spin me-2"></i> Sinkronisasi...';
  } else if (status === 'connected') {
    badge.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill status-badge';
    badge.innerHTML = '<i class="fas fa-wifi me-2"></i> Terhubung';
  } else if (status === 'error') {
    badge.className = 'badge bg-danger text-white px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i> Gagal Terhubung';
  }
}
function updateLastUpdated() {
  const now = new Date();
  document.getElementById('lastUpdate').innerText = `Diperbarui: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}
async function loadDataServer(isSilent = false) {
  isRekapanLoaded = false;
  isLogsLoaded = false;
  setDatabaseStatus('connecting');
  
  // Memberikan feedback visual jika tidak dalam mode silent (silent = update latar belakang)
  if (!isSilent) {
    const tabelBody = document.getElementById('tabelBody');
    if (tabelBody) {
      tabelBody.innerHTML = `<tr><td colspan="10" class="text-center py-5">
        <div class="spinner-border text-primary opacity-50 mb-3" style="width: 2.5rem; height: 2.5rem;"></div>
        <h6 class="text-muted fw-normal">Menarik data terbaru dari server...</h6>
      </td></tr>`;
    }
  }
  
  try {
    // Mengambil referensi bulan dari filter utama aplikasi
    const selectBulanUM = document.getElementById('filterBulanUM');
    const namaBulan = selectBulanUM ? selectBulanUM.options[selectBulanUM.selectedIndex].text : "";
    
    // Request ke Google Apps Script dengan parameter nama bulan dan timestamp anti-cache
    const response = await fetch(`${GAS_API_URL}?bulan=${encodeURIComponent(namaBulan)}&t=${new Date().getTime()}`);
    if (!response.ok) throw new Error('Jaringan bermasalah.');
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // 1. Simpan hasil ke variabel global aplikasi
      rawDataPegawai = result.data.rekapan || [];
      globalLogs = result.data.logs || [];
      systemLogsData = result.data.systemLogs || [];
      
      // 2. Simpan data detail bulanan (termasuk Hari Efektif dan Uang Makan kolom AJ/Index 35)
      globalHariEfektifBulanan = result.data.hariEfektifBulanan || {};
      
      // 3. Update dropdown pencarian jika tidak silent
      if (!isSilent) {
        if (typeof populateDropdownPegawai === 'function') populateDropdownPegawai(rawDataPegawai);
        if (typeof populateUMDropdowns === 'function') populateUMDropdowns(rawDataPegawai);
      }
      
      // 4. Update status database
      isRekapanLoaded = true;
      isLogsLoaded = true;
      setDatabaseStatus('connected');

      // 5. Jalankan seluruh fungsi Render untuk menyegarkan tampilan UI
      applyFilterBulan();
      
      // Render Tabel Rekapan Uang Makan (Tab Kehadiran/Pembayaran)
      if (typeof renderRekapanUangMakan === 'function') {
        renderRekapanUangMakan();
      }
      
      // Render Tabel Besaran Uang Makan (Tab Konfigurasi Besaran)
      // Ini memastikan angka "Rp" di tabel rincian langsung terupdate setelah simpan/pindah bulan
      if (typeof renderTabelBesaranUM === 'function') {
        renderTabelBesaranUM(); 
      }
      
    } else { 
      throw new Error(result.message);
    }
  } catch (error) {
    console.error("LoadDataServer Error: ", error);
    setDatabaseStatus('error');
    
    // Tampilkan pesan error ke user menggunakan sistem Toast yang ada
    if (typeof showToast === 'function') {
      showToast("Gagal memuat data: " + error.message, "error");
    }
  }
}
  
function renderChartBulanKeseluruhan() {
  const selectBulan = document.getElementById('selectBulanGlobal');
  if (!selectBulan) return;

  let bulanTerpilih = selectBulan.value;
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`;
  let mapData = {};

  // 1. Mapping Nama Bulan (Definisikan di awal)
  const shortMonths = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", 
    "05": "Mei", "06": "Jun", "07": "Jul", "08": "Ags", 
    "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
  };

  // 2. Pengumpulan Data dari globalLogs
  globalLogs.forEach(log => {
    let isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    if(isMatch && log.status !== "LIBUR") {
      if(!mapData[log.bulan]) { 
        mapData[log.bulan] = {
          "Hadir": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, 
          "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, 
          "Cuti Alasan Penting": 0, "Cuti Bersama": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0
        }; 
      }
      let st = (log.status || "").toUpperCase();
      if(st === "HADIR") mapData[log.bulan]["Hadir"]++;
      else if(st === "CUTI TAHUNAN") mapData[log.bulan]["Cuti Tahunan"]++;
      else if(st === "CUTI MELAHIRKAN") mapData[log.bulan]["Cuti Melahirkan"]++;
      else if(st === "CUTI SAKIT") mapData[log.bulan]["Cuti Sakit"]++;
      else if(st === "CUTI BESAR") mapData[log.bulan]["Cuti Besar"]++;
      else if(st === "CUTI DILUAR TANGGUNGAN NEGARA") mapData[log.bulan]["Cuti Diluar Tanggungan Negara"]++;
      else if(st === "CUTI ALASAN PENTING") mapData[log.bulan]["Cuti Alasan Penting"]++;
      else if(st === "DINAS LUAR" || st === "DL") mapData[log.bulan]["Dinas Luar"]++;
      else if(st === "TANPA KETERANGAN" || st === "TK") mapData[log.bulan]["Tanpa Keterangan"]++;
      else if(st === "CUTI BERSAMA") mapData[log.bulan]["Cuti Bersama"]++;
    }
  });

  // 3. Menyiapkan Labels (Kunci Asli)
  let labelsOriginal = Object.keys(mapData).sort(); 
  
  // 4. MENGUBAH LABEL KE FORMAT 3 KARAKTER (PASTI BERHASIL)
  let labelsNamaBulan = labelsOriginal.map(l => {
    // Ambil bagian bulan saja (misal "2026-03" -> "03" atau "03" -> "03")
    let kodeBulan = l.includes('-') ? l.split('-')[1] : l;
    // Ambil mapping, jika tidak ada tampilkan kode aslinya
    return shortMonths[kodeBulan] || kodeBulan;
  });

  // 5. Menyiapkan Datasets
  let datasets = [];
  if (typeof statusKeys !== 'undefined') {
    statusKeys.forEach(key => {
      // Kita gunakan labelsOriginal (angka) untuk map data agar tidak undefined
      let dataArray = labelsOriginal.map(b => mapData[b][key] || 0);
      if (dataArray.some(val => val > 0)) {
        datasets.push({ 
          label: key, 
          data: dataArray, 
          backgroundColor: colorMap[key] || '#cccccc', 
          borderRadius: 4, 
          barPercentage: 0.8 
        });
      }
    });
  }

  // 6. Rendering Grafik
  const canvas = document.getElementById('chartAllBulan');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if(window.chartAll) window.chartAll.destroy();
  if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

  window.chartAll = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: labelsNamaBulan.length ? labelsNamaBulan : ['No Data'], 
      datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0], backgroundColor: '#eee' }] 
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      interaction: { mode: 'index', intersect: false },
      animation: {
        duration: 1200,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { 
          position: 'bottom', 
          labels: { usePointStyle: true, boxWidth: 8, padding: 15, font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 } } 
        },
        datalabels: { 
          color: '#fff', 
          font: { weight: 'bold', size: 9 }, 
          formatter: (value) => value > 0 ? value : '' 
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.9)', 
          titleColor: '#2c3e50', 
          bodyColor: '#2c3e50', 
          borderColor: '#e9ecef', 
          borderWidth: 1 
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { weight: 'bold' } } },
        y: { stacked: true, border: { display: false }, grid: { color: '#f8f9fa' }, ticks: { precision: 0 } }
      }
    }
  });
}


function checkAndRenderRekapan() {
  if (isRekapanLoaded && isLogsLoaded) {
    applyFilterBulan();
    updateLastUpdated();
    setDatabaseStatus('connected'); 
  }
}

// ==========================================
// DATA PROCESSING & POPULATION
// ==========================================
function applyFilterBulan() {
  let selectBulan = document.getElementById('filterBulanRekapan');
  if (!selectBulan) return;

  let bulanTerpilih = selectBulan.value; 
  let teksBulanTerpilih = selectBulan.options[selectBulan.selectedIndex].text;
  
  let labelBulanStat = document.getElementById('labelBulanStat');
  if(labelBulanStat) {
    labelBulanStat.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${bulanTerpilih === "ALL" ? "Sepanjang Tahun" : teksBulanTerpilih}`;
  }

  let currentYear = new Date().getFullYear();
  let formatBulanKey = `${currentYear}-${bulanTerpilih}`; 
  let filteredData = [];

  const validCuti = ["CUTI TAHUNAN", "CUTI MELAHIRKAN", "CUTI SAKIT", "CUTI BESAR", "CUTI DILUAR TANGGUNGAN NEGARA", "CUTI ALASAN PENTING"];

  rawDataPegawai.forEach(pegawai => {
    let logsBulanIni = globalLogs.filter(log => log.nama === pegawai.nama && (bulanTerpilih === "ALL" || log.bulan === formatBulanKey));
    
    let jmlHadir = 0, jmlCuti = 0, jmlDL = 0, jmlTK = 0;
    let notesBulanIni = []; 
    
    logsBulanIni.forEach(log => {
      let st = (log.status || "").toUpperCase();
      if (st === "HADIR") jmlHadir++;
      else if (st === "DINAS LUAR" || st === "DL") jmlDL++;
      else if (st === "TANPA KETERANGAN" || st === "TK") jmlTK++;
      else if (validCuti.includes(st)) jmlCuti++;
      
      if (log.keterangan && log.keterangan.trim() !== "") {
        let hariTgl = log.tanggal ? log.tanggal.split('-')[2] : "??"; 
        notesBulanIni.push(`&bull; Tgl ${hariTgl}: <span class="text-dark">${log.keterangan}</span>`);
      }
    });
    
    // --- LOGIKA HARI EFEKTIF: WAJIB DARI TAB JAN-DES ---
    let hariEfektif = 0;
    if (bulanTerpilih !== "ALL") {
      if (typeof globalHariEfektifBulanan !== 'undefined' && globalHariEfektifBulanan[formatBulanKey] && globalHariEfektifBulanan[formatBulanKey][pegawai.nama]) {
        hariEfektif = globalHariEfektifBulanan[formatBulanKey][pegawai.nama];
      }
    } else {
      hariEfektif = parseInt(pegawai.hariEfektif) || 0; 
    }
    
    let finalKeterangan = notesBulanIni.length > 0 ? notesBulanIni.join('<br>') : '<span class="text-muted fst-italic">-</span>';

    filteredData.push({
      no: pegawai.no, nama: pegawai.nama, golongan: pegawai.golongan,
      hariEfektif: hariEfektif, cuti: jmlCuti, dl: jmlDL, tk: jmlTK,
      jmlTidakHadir: (jmlCuti + jmlDL + jmlTK), jumlahKehadiran: jmlHadir, keterangan: finalKeterangan
    });
  });

  populateTabelRekapan(filteredData);
}

function animateValue(id, start, end, duration, suffix = '') {
  const obj = document.getElementById(id); if(!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start) + suffix;
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function populateTabelRekapan(data) {
  let currentPage = 0; let currentSearch = '';
  if (dataTableRekapan) {
    currentPage = dataTableRekapan.page(); currentSearch = dataTableRekapan.search(); dataTableRekapan.destroy();
  }
  
  let tbody = '';
  data.forEach(row => {
    tbody += `<tr>
      <td class="text-muted fw-medium">${row.no}</td>
      <td class="text-start fw-bold text-dark">${row.nama}</td>
      <td><span class="badge bg-light text-secondary border border-secondary border-opacity-25 px-2 py-1">${row.golongan}</span></td>
<td class="fw-bold text-primary">${typeof row.hariEfektif === 'object' ? row.hariEfektif.hariEfektif : row.hariEfektif}</td>
      <td class="text-muted">${row.cuti}</td>
      <td class="text-muted">${row.dl}</td>
      <td class="text-muted">${row.tk}</td>
      <td class="fw-bold text-danger bg-danger bg-opacity-10">${row.jmlTidakHadir}</td>
      <td class="fw-bold text-success bg-success bg-opacity-10">${row.jumlahKehadiran}</td>
      <td class="text-start small lh-sm">${row.keterangan}</td>
    </tr>`;
  });
  document.getElementById('tabelBody').innerHTML = tbody;
  
  dataTableRekapan = $('#tabelRekapan').DataTable({ 
     pageLength: 10, 
     language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
     dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>',
  });
  
  if (currentSearch) dataTableRekapan.search(currentSearch);
  dataTableRekapan.page(currentPage).draw('page');
}

function populateDaftarPegawai(data) {
  let currentPage = 0; let currentSearch = '';
  if (dataTableMaster) { currentPage = dataTableMaster.page(); currentSearch = dataTableMaster.search(); dataTableMaster.destroy(); }
  let tbody = '';
  data.forEach(row => {
    tbody += `<tr>
      <td>${row.no}</td><td class="text-start fw-bold">${row.nama}</td><td>${row.golongan}</td>
      <td>${row.group !== "-" && row.group !== "" ? `<span class="badge bg-secondary">${row.group}</span>` : "-"}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-primary m-1 shadow-sm" onclick="bukaModalEdit('${row.nama}', '${row.golongan}', '${row.group}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger m-1 shadow-sm" onclick="hapusData('${row.nama}')"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>`;
  });
  $('#masterPegawaiBody').html(tbody);
  
  // MENGGUNAKAN HTTPS UNTUK CDN
  dataTableMaster = $('#tabelMasterPegawai').DataTable({ 
    pageLength: 5, 
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' }
  });
  
  if (currentSearch) dataTableMaster.search(currentSearch); dataTableMaster.page(currentPage).draw('page');
    document.getElementById('countPegawai').innerText = data.length;
}

function populateDropdownPegawai(data) {
    let options = '<option value="">Pilih/Ketik Pegawai...</option>';
    
    // Menggunakan data asal tanpa .sort() agar mengikut urutan pangkalan data
    data.forEach(row => { 
      options += `<option value="${row.nama}">${row.nama}</option>`; 
    });
    
    $('#selectGrafikPegawai').html(options).trigger('change');
    $('#nama').html(options).trigger('change');
  }

function populateDropdownGroup(data) {
  // 1. Ambil data unik Group dan Golongan
  let uniqueGroups = [...new Set(data.map(item => item.group))].filter(g => g !== "-" && g !== "" && g !== undefined);
  let uniqueGolongan = [...new Set(data.map(item => item.golongan))].filter(g => g !== "-" && g !== "" && g !== undefined);

  // 2. Siapkan template options
  let optionsMassal = '<option value="ALL" class="fw-bold text-primary">Semua Group (Seluruh Pegawai)</option>';
  let listGroupHTML = ''; 
  let optionsSearch = '<option value="">-- Silakan Pilih Group --</option>';
  
  // 3. Loop untuk mengisi konten dropdown
  uniqueGroups.forEach(g => { 
    optionsMassal += `<option value="${g}">${g}</option>`; 
    listGroupHTML += `<option value="${g}">${g}</option>`; 
    optionsSearch += `<option value="${g}">${g}</option>`; 
  });

  // --- RENDER KE ELEMENT HTML ---
  
  // Menu Dropdown (Status Massal & Hari Efektif)
$('#groupMassal, #groupEfektif').html(optionsMassal);
  // Menu List (Datalist untuk input manual)
  $('#listGroup').html(listGroupHTML);
  
  // Menu Filter & Pindah Group
  $('#searchGroup').html(optionsSearch);
  $('#pindahTargetGroup').html(optionsSearch.replace('-- Silakan Pilih Group --', 'Pilih target group tujuan...'));
  
  // List Golongan
  let listGolonganHTML = ''; 
  uniqueGolongan.forEach(g => { 
    listGolonganHTML += `<option value="${g}">${g}</option>`; 
  });
  $('#listGolongan').html(listGolonganHTML);
}

// ==========================================
// CHARTS
// ==========================================
const colorMap = {
  "Hadir": "#198754", "Cuti Tahunan": "#0dcaf0", "Cuti Melahirkan": "#d63384",
  "Cuti Sakit": "#fd7e14", "Cuti Besar": "#6f42c1", "Cuti Diluar Tanggungan Negara": "#6c757d",
  "Cuti Alasan Penting": "#ffc107", "Cuti Bersama": "#20c997", "Dinas Luar": "#0d6efd", 
  "Tanpa Keterangan": "#dc3545", "Libur": "#adb5bd"
};
const statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Diluar Tanggungan Negara", "Cuti Alasan Penting", "Cuti Bersama", "Dinas Luar", "Tanpa Keterangan", "Libur"];

function renderChartBulanKeseluruhan() {
  let bulanTerpilih = $('#selectBulanGlobal').val(); 
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`; 
  let mapData = {};

  globalLogs.forEach(log => {
    let isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    if(isMatch && log.status !== "LIBUR") {
      if(!mapData[log.bulan]) { 
        mapData[log.bulan] = {"Hadir": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0}; 
      }
      let st = log.status.toUpperCase();
      if(st === "HADIR") mapData[log.bulan]["Hadir"]++; 
      else if(st === "DL" || st === "DINAS LUAR") mapData[log.bulan]["Dinas Luar"]++; 
      else if(st === "TK" || st === "TANPA KETERANGAN") mapData[log.bulan]["Tanpa Keterangan"]++;
      else {
        let key = Object.keys(colorMap).find(k => k.toUpperCase() === st);
        if(key) mapData[log.bulan][key]++;
      }
    }
  });

  let labels = Object.keys(mapData).sort(); 
  let datasets = [];
  
  // Ambil keys dari stats untuk memastikan urutan konsisten
  let statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Diluar Tanggungan Negara", "Cuti Alasan Penting", "Dinas Luar", "Tanpa Keterangan"];

  statusKeys.forEach(key => {
    let dataArray = labels.map(b => mapData[b][key] || 0);
    if (dataArray.some(val => val > 0)) {
      datasets.push({ 
        label: key, 
        data: dataArray, 
        backgroundColor: colorMap[key] || "#cccccc", 
        borderRadius: 4, 
        barPercentage: 0.8 
      });
    }
  });

  const ctx = document.getElementById('chartAllBulan').getContext('2d');
  
  if(chartAll) chartAll.destroy(); 
  
  // Registrasi Plugin Datalabels
  if (typeof ChartDataLabels !== 'undefined') { 
    Chart.register(ChartDataLabels); 
  }

  chartAll = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: labels.length ? labels.map(l => l.substring(5)) : ['No Data'], 
      datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0] }] 
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      interaction: { mode: 'index', intersect: false },
      plugins: { 
        legend: { 
          position: 'bottom', 
          labels: { 
            usePointStyle: true, 
            boxWidth: 8, 
            padding: 15, 
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } 
          } 
        }, 
        // KONFIGURASI TEKS ANGKA OTOMATIS
        datalabels: { 
          display: true, // Memaksa teks muncul tanpa hover
          color: '#ffffff', 
          font: { weight: 'bold', size: 10, family: "'Plus Jakarta Sans', sans-serif" }, 
          // Atur posisi angka di tengah batang yang bertumpuk (stacked)
          anchor: 'center',
          align: 'center',
          formatter: (value) => {
            // Hanya tampilkan jika angka lebih besar dari 0 agar tidak berantakan
            return value > 0 ? value : ''; 
          },
          // Outline tipis agar angka lebih jelas terbaca jika warna bar terang
          textStrokeColor: 'rgba(0,0,0,0.2)',
          textStrokeWidth: 1
        } 
      },
      scales: { 
        x: { 
          stacked: true, 
          grid: { display: false },
          ticks: { font: { family: "'Plus Jakarta Sans'" } }
        }, 
        y: { 
          stacked: true, 
          border: { display: false }, 
          grid: { color: '#f1f5f9' }, 
          ticks: { 
            precision: 0,
            font: { family: "'Plus Jakarta Sans'" }
          } 
        } 
      }
    }
  });
}

function updateChartPegawai() {
  let namaPegawai = document.getElementById('selectGrafikPegawai').value;
  if(!namaPegawai) return;

  let bulanTerpilih = document.getElementById('selectBulanGrafik').value;
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`;

  // Daftar rekapan status sesuai permintaan
  let stats = { 
    "Hadir": 0, "Libur": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, 
    "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, 
    "Cuti Bersama": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0 
  };

  globalLogs.forEach(log => {
    if(log.nama === namaPegawai && (bulanTerpilih === "ALL" || log.bulan === formatBulan)) {
      let st = log.status.toUpperCase();
      
      if(st === "HADIR") stats["Hadir"]++;
      else if(st === "LIBUR") stats["Libur"]++;
      else if(st === "CUTI TAHUNAN") stats["Cuti Tahunan"]++;
      else if(st === "CUTI MELAHIRKAN") stats["Cuti Melahirkan"]++;
      else if(st === "CUTI SAKIT") stats["Cuti Sakit"]++;
      else if(st === "CUTI BESAR") stats["Cuti Besar"]++;
      else if(st === "CUTI DILUAR TANGGUNGAN NEGARA") stats["Cuti Diluar Tanggungan Negara"]++;
      else if(st === "CUTI ALASAN PENTING") stats["Cuti Alasan Penting"]++;
      else if(st === "DINAS LUAR" || st === "DL") stats["Dinas Luar"]++;
      else if(st === "TANPA KETERANGAN" || st === "TK") stats["Tanpa Keterangan"]++;
      else if(st === "CUTI BERSAMA") stats["Cuti Bersama"]++;
    }
  });

  let labels = [], dataCounts = [], bgColors = [], totalTercatat = 0;
  
  for (let key in stats) {
    if (stats[key] > 0) { 
      labels.push(key); 
      dataCounts.push(stats[key]); 
      bgColors.push(colorMap[key] || "#cccccc"); 
      totalTercatat += stats[key]; 
    }
  }

  let pembagi = totalTercatat;

  const ctx = document.getElementById('chartPerPegawai').getContext('2d');
  
  // Hancurkan chart lama agar animasi memutar (rotate) selalu muncul saat update
  if(chartPersonal) chartPersonal.destroy();

  // Pastikan plugin ChartDataLabels terdaftar
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  chartPersonal = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels.length ? labels : ['Belum Ada Data'],
      datasets: [{ 
        data: dataCounts.length ? dataCounts : [1], 
        backgroundColor: bgColors.length ? bgColors : ['#f8f9fa'], 
        borderWidth: 1, 
        hoverOffset: 15 
      }]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      animation: { 
        animateRotate: true, 
        animateScale: true, 
        duration: 1500, 
        easing: 'easeOutQuart' 
      },
      plugins: {
        legend: { 
          position: 'right', 
          labels: { 
            usePointStyle: true, 
            padding: 15, 
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } 
          } 
        },
        // KONFIGURASI TEKS PERSENTASE OTOMATIS
        datalabels: { 
          display: true, // Memastikan teks selalu tampil
          anchor: 'center', // Meletakkan teks di tengah irisan
          align: 'center',
          color: (context) => {
             let label = context.chart.data.labels[context.dataIndex];
             // Jika warna background terang, gunakan teks gelap
             return label === 'Belum Ada Data' || label === 'Libur' ? '#475569' : '#ffffff';
          },
          font: { weight: 'bold', size: 13, family: "'Plus Jakarta Sans', sans-serif" },
          formatter: (value, context) => {
            let label = context.chart.data.labels[context.dataIndex];
            if (label === 'Belum Ada Data' || pembagi === 0) return '';
            let percentage = ((value / pembagi) * 100).toFixed(1);
            // Hanya tampilkan jika irisan cukup besar (di atas 1%) agar tidak tumpang tindih
            return percentage > 1 ? percentage + '%' : ''; 
          },
          textStrokeColor: 'rgba(0,0,0,0.1)', // Outline tipis agar lebih terbaca
          textStrokeWidth: 1,
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.9)', 
          titleColor: '#2c3e50', 
          bodyColor: '#2c3e50', 
          borderColor: '#e9ecef', 
          borderWidth: 1, 
          callbacks: { 
            label: (c) => {
              if (pembagi === 0) return ' Belum Ada Data';
              let percentage = ((c.raw / pembagi) * 100).toFixed(1);
              return ` ${c.label}: ${c.raw} Hari (${percentage}%)`;
            }
          } 
        }
      }
    }
  });

  // Opsional: Jalankan render chart keseluruhan jika fungsinya ada
  if (typeof renderChartBulanKeseluruhan === 'function') {
    renderChartBulanKeseluruhan();
  }
}
// ==========================================
// CRUD ACTIONS (POST)
// ==========================================
function showToast(message, type) {
  let bgColor = type === 'success' ? 'bg-success' : (type === 'error' ? 'bg-danger' : 'bg-primary');
  let toastHTML = `
    <div class="toast align-items-center text-white ${bgColor} border-0 show shadow mb-2" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-bold">
          ${type === 'success' ? '<i class="fas fa-check-circle me-2"></i>' : (type==='error'?'<i class="fas fa-exclamation-triangle me-2"></i>':'<i class="fas fa-info-circle me-2"></i>')}
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.parentElement.parentElement.remove()"></button>
      </div>
    </div>`;
  let container = document.getElementById('toastContainer');
  let tempDiv = document.createElement('div'); tempDiv.innerHTML = toastHTML;
  container.appendChild(tempDiv.firstElementChild);
  setTimeout(() => { if(container.lastChild) { container.lastChild.style.opacity='0'; setTimeout(()=>container.lastChild.remove(),300); } }, 4000);
}

// 1. HANDLE ABSENSI INDIVIDUAL (TAB PENGECUALIAN)
async function handleAbsensiSubmit(e) {
  e.preventDefault();
  
  // Ambil referensi tombol
  let btn = $('#btnSubmitAbsen'); 
  // Simpan konten asli agar bisa dikembalikan dengan tepat (termasuk ikon)
  let originalContent = '<i class="fas fa-save me-2"></i>Simpan Perubahan';
  
  // AKTIFKAN LOADING
  btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);
  
  let obj = { 
    tanggal: $('#tanggal').val(), 
    nama: $('#nama').val(), 
    status: $('#status').val(), 
    keterangan: $('#keterangan').val() 
  };
  
  try {
    let res = await fetchPost('submitAbsensi', obj);
    showToast(res.message, res.status); 
    
    // Logika reset form tetap dipertahankan
    if(res.status === 'success') {
      $('#formAbsensi')[0].reset(); 
      $('#nama').val(null).trigger('change');
      loadDataServer(true);
    }
  } catch(err) { 
    showToast(err.message, "error"); 
  } finally {
    // KEMBALIKAN TOMBOL (Tanpa mengurangi kode sebelumnya)
    btn.html(originalContent).prop('disabled', false);
  }
}

// 2. HANDLE HARI EFEKTIF
async function handleHariEfektif(e) {
  e.preventDefault();
  
  const grp = $('#groupEfektif').val();
  const namaBulan = $('#bulanEfektif option:selected').text();
  const jmlHari = $('#jumlahHari').val();
  
  let confirmMsg = `Update hari efektif di TAB [${namaBulan}] untuk Group: ${grp}?`;

  if (confirm(confirmMsg)) {
    const btn = $('#btnSubmitEfektif');
    let originalContent = '<i class="fas fa-save me-2"></i>Simpan Konfigurasi';
    
    // AKTIFKAN LOADING
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);

    const obj = {
      targetSheet: namaBulan,
      group: grp,
      hariEfektif: parseInt(jmlHari)
    };

    try {
      let res = await fetchPost('setHariEfektif', obj);
      showToast(res.message, res.status);
      if (res.status === 'success') {
        $('#formHariEfektif')[0].reset();
        loadDataServer(true); 
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      // KEMBALIKAN TOMBOL
      btn.html(originalContent).prop('disabled', false);
    }
  }
}

// 3. HANDLE STATUS MASSAL
async function handleStatusMassal(e) {
  e.preventDefault(); 
  let grp = $('#groupMassal').val();
  let confirmMsg = grp === "ALL" ? "Status SELURUH PEGAWAI akan diubah jadi HADIR. Lanjutkan?" : `Status seluruh pegawai di GROUP ${grp} akan diubah jadi HADIR. Lanjutkan?`;
  
  if(confirm(confirmMsg)) {
    let btn = $('#btnStatusMassal'); 
    let originalContent = '<i class="fas fa-bolt me-2"></i>Eksekusi Perubahan';
    
    // AKTIFKAN LOADING
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
    
    let obj = { 
      tanggal: $('#tanggalMassal').val(), 
      group: grp, 
      status: $('#statusMassal').val(), 
      keterangan: "" 
    };

    try {
      let res = await fetchPost('setStatusMassal', obj);
      showToast(res.message, res.status); 
      if(res.status === 'success') {
        $('#formStatusMassal')[0].reset();
        loadDataServer(true);
      }
    } catch(err) { 
      showToast(err.message, "error"); 
    } finally {
      // KEMBALIKAN TOMBOL
      btn.html(originalContent).prop('disabled', false);
    }
  }
}

async function handlePegawaiSubmit(e) {
  e.preventDefault();
  let btn = $('#btnSubmitPegawai');
  btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
  let obj = { namaBaru: $('#namaBaru').val(), golongan: $('#golongan').val(), group: $('#groupBaru').val() };
  try {
    let res = await fetchPost('simpanPegawaiBaru', obj);
    showToast(res.message, res.status);
    $('#formPegawai')[0].reset();
    if(res.status === 'success') {
      // Ambil data terbaru dari server agar urutan nomor sesuai database
      let response = await fetch(`${GAS_API_URL}?t=${new Date().getTime()}`);
      let result = await response.json();
      if (result.status === 'success') {
        rawDataPegawai = result.data.rekapan;
        populateDaftarPegawai(rawDataPegawai);
        // Pindah ke halaman terakhir
        let table = $('#tabelMasterPegawai').DataTable();
        let lastPage = table.page.info().pages - 1;
        table.page(lastPage).draw('page');
      }
    }
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-plus me-2"></i>Tambahkan').prop('disabled', false);
}

function bukaModalEdit(nama, golongan, group) {
  $('#editOldNama').val(nama); $('#editNewNama').val(nama); $('#editNewGolongan').val(golongan); $('#editNewGroup').val(group === "-" ? "" : group);
  new bootstrap.Modal(document.getElementById('modalEdit')).show();
}

async function handleEditSubmit(e) {
  e.preventDefault(); let btn = $('#btnSimpanEdit'); btn.html('Menyimpan...').prop('disabled', true);
  let obj = { oldNama: $('#editOldNama').val(), newNama: $('#editNewNama').val(), newGolongan: $('#editNewGolongan').val(), newGroup: $('#editNewGroup').val() };
  try {
    let res = await fetchPost('editPegawai', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalEdit')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('Simpan Perubahan').prop('disabled', false);
}

async function hapusData(nama) {
  if (confirm(`Peringatan! Hapus permanen data pegawai: ${nama}?`)) {
    showToast(`Menghapus data ${nama}...`, 'info');
    try {
      let res = await fetchPost('hapusPegawai', nama);
      showToast(res.message, res.status);
      if (res.status === 'success') {
        // Hapus baris dari tabel tanpa reload
        $(`#masterPegawaiBody tr`).filter(function() {
          return $(this).find('td:nth-child(2)').text().trim() === nama;
        }).remove();
        // Update jumlah pegawai
        let count = $('#masterPegawaiBody tr').length;
        $('#countPegawai').text(count);
      }
    } catch(err) { showToast(err.message, "error"); }
  }
}

async function handleResetAbsensi() {
  if (confirm("🚨 PERINGATAN BAHAYA!\n\nAnda yakin ingin MENGHAPUS SEMUA ISI ABSENSI di semua bulan untuk memulai dari awal?")) {
    if (prompt("Ketik 'RESET' untuk melanjutkan:") === "RESET") {
      showToast("Mereset data...", "info");
      try {
        let res = await fetchPost('resetSemuaAbsensi', {});
        showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
      } catch(err) { showToast(err.message, "error"); }
    } else showToast("Proses dibatalkan.", "error");
  }
}

// --- MANAJEMEN GROUP ---
function tampilkanAnggotaGroup() {
  let selectedGroup = $('#searchGroup').val(); let tbody = $('#bodyAnggotaGroup');
  if(!selectedGroup) { tbody.html('<tr><td colspan="4" class="text-muted py-5"><i class="fas fa-info-circle me-2"></i>Pilih group pada dropdown.</td></tr>'); return; }
  let anggota = rawDataPegawai.filter(p => p.group === selectedGroup);
  if(anggota.length === 0) { tbody.html(`<tr><td colspan="4" class="text-danger fw-bold py-5"><i class="fas fa-exclamation-triangle me-2"></i>Tidak ada pegawai di group ini.</td></tr>`); return; }
  
  let html = '';
  anggota.forEach((p, idx) => {
    html += `<tr><td>${idx + 1}</td><td class="text-start fw-bold">${p.nama}</td><td>${p.golongan}</td>
      <td>
        <button class="btn btn-sm btn-info text-white mx-1 shadow-sm" onclick="bukaModalPindahGroup('${p.nama}', '${p.group}')"><i class="fas fa-exchange-alt"></i> Pindah</button>
        <button class="btn btn-sm btn-outline-danger mx-1 shadow-sm" onclick="hapusDariGroup('${p.nama}')"><i class="fas fa-user-minus"></i> Keluarkan</button>
      </td></tr>`;
  });
  tbody.html(html);
}

async function hapusDariGroup(nama) {
  if(confirm(`Keluarkan ${nama} dari group ini?`)) {
    showToast(`Mengeluarkan ${nama}...`, "info");
    try {
      let res = await fetchPost('ubahGroupPegawai', {nama: nama, newGroup: "-"});
      showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
    } catch(err) { showToast(err.message, "error"); }
  }
}

function bukaModalPindahGroup(nama) {
  $('#pindahNamaPegawai').val(nama); $('#labelPindahNama').text(nama);
  new bootstrap.Modal(document.getElementById('modalPindahGroup')).show();
}

async function simpanPindahGroup(e) {
  e.preventDefault(); let btn = $('#btnSimpanPindah'); btn.html("Memproses...").prop('disabled', true);
  let obj = { nama: $('#pindahNamaPegawai').val(), newGroup: $('#pindahTargetGroup').val() };
  try {
    let res = await fetchPost('ubahGroupPegawai', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalPindahGroup')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html("Konfirmasi Pindah").prop('disabled', false);
}

function bukaModalBuatGroup() {
  let html = '';
  [...rawDataPegawai].sort((a,b) => a.nama.localeCompare(b.nama)).forEach(p => {
    let badge = p.group !== "-" && p.group !== "" ? `<span class="badge bg-secondary bg-opacity-25 text-secondary ms-2" style="font-size:0.65em;">${p.group}</span>` : '';
    html += `<div class="col-md-6 mb-2"><div class="form-check border-bottom pb-2"><input class="form-check-input chk-pegawai shadow-sm" type="checkbox" value="${p.nama}" id="chk_${p.no}"><label class="form-check-label w-100" style="cursor:pointer;" for="chk_${p.no}">${p.nama} ${badge}</label></div></div>`;
  });
  $('#listCheckboxPegawai').html(html); $('#namaGroupBaru').val("");
  new bootstrap.Modal(document.getElementById('modalBuatGroup')).show();
}

async function simpanGroupBaru(e) {
  e.preventDefault(); let checkedBoxes = document.querySelectorAll('.chk-pegawai:checked');
  if(checkedBoxes.length < 2) { alert("Harap centang minimal 2 pegawai!"); return; }
  let btn = $('#btnSimpanGroupBaru'); btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);
  let obj = { namaGroup: $('#namaGroupBaru').val(), pegawaiList: Array.from(checkedBoxes).map(cb => cb.value) };
  try {
    let res = await fetchPost('buatGroupBaru', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalBuatGroup')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-save me-2"></i>Simpan Group').prop('disabled', false);
}

// ==========================================
// RENDER TABEL LOG AKTIVITAS
// ==========================================
function populateLogAktivitas(sysLogs) {
    if (dataTableLogs) { dataTableLogs.destroy(); }
    
    let tbody = '';
    // MENGURUTKAN OTOMATIS: dari perubahan data yang paling terbaru
    const sortedLogs = [...sysLogs].sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
    
    sortedLogs.forEach(log => {
      let badgeClass = 'bg-light text-dark border';
      let act = log.aktivitas.toUpperCase();
      
      // Penyesuaian warna badge berdasarkan jenis aktivitas (Edit, Hapus, Absen, dll)
      if(act.includes('ABSEN')) badgeClass = 'bg-success bg-opacity-10 text-success border-success border-opacity-25';
      else if(act.includes('HAPUS') || act.includes('RESET')) badgeClass = 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-25';
      else if(act.includes('PEGAWAI') || act.includes('GROUP')) badgeClass = 'bg-primary bg-opacity-10 text-primary border-primary border-opacity-25';
      else if(act.includes('EDIT')) badgeClass = 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-25';
  
      // Format tampilan waktu
      let dateObj = new Date(log.waktu);
      let timeStr = dateObj.toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
  
      tbody += `<tr>
        <td class="fw-medium text-muted text-start" style="white-space: nowrap;"><i class="fas fa-clock me-2 opacity-50"></i>${timeStr}</td>
        <td class="fw-bold"><span class="badge ${badgeClass} px-3 py-2 w-100 rounded-pill">${log.aktivitas}</span></td>
        <td class="small text-start lh-sm">${log.keterangan || '<span class="text-muted fst-italic">-</span>'}</td>
      </tr>`;
    });
    
    $('#logAktivitasBody').html(tbody);
    
    dataTableLogs = $('#tabelLogAktivitas').DataTable({
      pageLength: 10,
      order: [[0, 'desc']], // Tetap pertahankan filter DataTable memprioritaskan terbaru
      language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
      dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>'
    });
  }

// ==========================================
// HAPUS SEMUA LOG AKTIVITAS
// ==========================================
async function handleHapusSemuaLog() {
    if (confirm("🚨 PERINGATAN!\n\nAnda yakin ingin MENGHAPUS SEMUA RIWAYAT LOG AKTIVITAS?\nData yang sudah dihapus tidak dapat dikembalikan.")) {
      
      // Konfirmasi keamanan ganda
      if (prompt("Ketik 'HAPUS' (huruf besar) untuk melanjutkan konfirmasi:") === "HAPUS") {
        showToast("Menghapus seluruh log aktivitas...", "info");
        
        try {
          let btn = $('button[onclick="handleHapusSemuaLog()"]');
          btn.html('<i class="fas fa-spinner fa-spin me-1"></i> Menghapus...').prop('disabled', true);
          
          let res = await fetchPost('hapusSemuaLog', {});
          showToast(res.message, res.status); 
          
          if(res.status === 'success') {
             loadDataServer(true); // Memuat ulang tabel di latar belakang
          }
          
          btn.html('<i class="fas fa-trash-alt me-1"></i> Kosongkan Log').prop('disabled', false);
        } catch(err) { 
          showToast(err.message, "error"); 
        }
      } else {
        showToast("Proses penghapusan log dibatalkan.", "error");
      }
    }
  }
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.addEventListener('click', function(e) {
    window.open(this.href, '_blank');
  });
});
/**
 * Memuat ulang iframe database dan memberikan feedback visual
 */
function refreshDatabase(e) {
  const btn = $('#btnRefreshDb');
  const frame = $('#frame-database');
  const originalHtml = '<i class="fas fa-sync-alt"></i>';
  
  // Aktifkan Spinner pada tombol
  btn.html('<i class="fas fa-sync-alt fa-spin"></i>').prop('disabled', true);
  
  // Reload Iframe
  const currentSrc = frame.attr('src');
  frame.attr('src', ''); // Kosongkan dulu sebentar
  
  // Gunakan timeout kecil agar transisi reload terasa
  setTimeout(() => {
    frame.attr('src', currentSrc);
    
    // Kembalikan tombol setelah proses selesai
    setTimeout(() => {
      btn.html(originalHtml).prop('disabled', false);
      if (typeof showToast === "function") {
        showToast("Database Absensi telah dimuat ulang", "info");
      }
    }, 1000);
  }, 100);
}
// Tambahkan pemanggilan ini di dalam populateDropdownGroup(data)
function populateUMDropdowns(data) {
    let options = '<option value="ALL">Semua Group</option>';
    let groups = [...new Set(data.map(item => item.group))].filter(g => g !== "-" && g !== "");
    groups.forEach(g => { options += `<option value="${g}">${g}</option>`; });
    $('.select-group-um').html(options);
}

// Fungsi untuk menghitung rincian read-only pada Tab B
function calculateRincianUM() {
    const targetGroup = $('#sp2dGroup').val();
    let filtered = rawDataPegawai;
    if(targetGroup !== 'ALL') {
        filtered = rawDataPegawai.filter(p => p.group === targetGroup);
    }

    // Contoh logika statis besaran (nantinya ambil dari data server)
    const rates = { 'IV': 41000, 'III': 37000, 'II': 35000 };
    let rincianHTML = '';
    let grandTotal = 0;

    ['IV', 'III', 'II'].forEach(gol => {
        let count = filtered.filter(p => (p.golongan || '').includes(gol)).length;
        // Simulasi hitung hadir (total hadir bulan ini dari globalLogs)
        // Disini bisa dikembangkan lebih lanjut sesuai mapping data absensi
        let totalHadirGol = 0; 
        let subTotal = count * rates[gol] * 22; // Contoh 22 hari

        rincianHTML += `
            <div class="d-flex justify-content-between mb-2">
                <span>Golongan ${gol} (${count} Orang)</span>
                <span class="fw-bold">Rp ${subTotal.toLocaleString('id-ID')}</span>
            </div>`;
        grandTotal += subTotal;
    });

    $('#rincianUMGolongan').html(rincianHTML);
    $('#grandTotalUM').text(`Rp ${grandTotal.toLocaleString('id-ID')}`);
}

// Event listener untuk perubahan group pada tab uang makan
$(document).on('change', '.select-group-um', function() {
    calculateRincianUM();
});

function renderRekapanUangMakan() {
  const selectBulan = document.getElementById('filterBulanUM');
  const bodyUM = document.getElementById('bodyRekapanUM');
  if (!selectBulan || !bodyUM) return;

  const bulanTerpilih = selectBulan.value;
  const currentYear = new Date().getFullYear();
  const formatBulan = `${currentYear}-${bulanTerpilih}`; 
  
  let totalKeseluruhanUM = 0;
  let countSPM = 0;
  let countSP2D = 0;
  let tbody = '';

  rawDataPegawai.forEach((pegawai) => {
    // 1. AMBIL DATA DARI GLOBAL BERDASARKAN FILTER BULAN
    const dataBulanan = (globalHariEfektifBulanan && globalHariEfektifBulanan[formatBulan]) 
                        ? globalHariEfektifBulanan[formatBulan][pegawai.nama] 
                        : null;

    let noSPM = "";
    let noSP2D = "";
    let hariEfektif = 0;

    // AMBIL DATA DARI OBJEK BULANAN (Sesuai Struktur gs.txt terbaru)
    if (dataBulanan && typeof dataBulanan === 'object') {
        hariEfektif = dataBulanan.hariEfektif || 0;
        noSPM = String(dataBulanan.noSPM || "").trim();
        noSP2D = String(dataBulanan.noSP2D || "").trim();
    } else if (dataBulanan) {
        hariEfektif = dataBulanan; // Fallback jika hanya angka
    }

    // 2. LOGIKA STATISTIK (DIPISAH AGAR KEDUANYA BISA TERHITUNG)
    const isSPMValid = (noSPM !== "" && noSPM !== "-");
    const isSP2DValid = (noSP2D !== "" && noSP2D !== "-");

    if (isSP2DValid) {
        countSP2D++;
        // KARENA JIKA SP2D TERISI PASTI SPM SUDAH TERISI:
        countSPM++; 
    } else if (isSPMValid) {
        countSPM++;
    }

    // 3. LOGIKA BADGE (TETAP PRIORITAS TAMPILAN)
    let statusBadge = '';
    if (isSP2DValid) {
        statusBadge = '<span class="badge bg-info bg-opacity-10 text-info border px-3 py-2 rounded-pill"><i class="fas fa-check-circle me-1"></i> Uang Diterima</span>';
    } else if (isSPMValid) {
        statusBadge = '<span class="badge bg-success bg-opacity-10 text-success border px-3 py-2 rounded-pill"><i class="fas fa-file-invoice-dollar me-1"></i> Proses SP2D</span>';
    } else {
        statusBadge = '<span class="badge bg-warning bg-opacity-10 text-warning border px-3 py-2 rounded-pill"><i class="fas fa-clock me-1"></i> Proses Kehadiran</span>';
    }

    // 4. NOMINAL UANG MAKAN DARI TAB REKAPAN (KOLOM R)
    let cleanUM = String(pegawai.uangMakan || "0").replace(/[^\d.-]/g, '');
    let nominalUMHarian = parseFloat(cleanUM) || 0;

    // 5. HITUNG HADIR DARI LOGS
    const logsBulanIni = globalLogs.filter(log => log.nama === pegawai.nama && log.bulan === formatBulan);
    const jmlHadir = logsBulanIni.filter(log => (log.status || "").toUpperCase() === "HADIR").length;

    const totalUM = jmlHadir * nominalUMHarian;
    totalKeseluruhanUM += totalUM;

    tbody += `<tr>
      <td>${pegawai.no}</td>
      <td class="text-start fw-bold">${pegawai.nama}</td>
      <td>${pegawai.golongan}</td>
      <td class="fw-bold text-primary">${hariEfektif}</td> 
      <td class="fw-bold text-success">${jmlHadir}</td>
      <td class="fw-bold text-dark">Rp ${totalUM.toLocaleString('id-ID')}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });

  bodyUM.innerHTML = tbody || '<tr><td colspan="7" class="text-center py-4">Data tidak ditemukan</td></tr>';
  
  // 6. UPDATE STATISTIK DI UI
  const elTotalUM = document.getElementById('statTotalUM');
  const elCountSPM = document.getElementById('countSPM');
  const elCountSP2D = document.getElementById('countSP2D');

  if(elTotalUM) elTotalUM.innerText = `Rp ${totalKeseluruhanUM.toLocaleString('id-ID')}`;
  if(elCountSPM) elCountSPM.innerText = countSPM;
  if(elCountSP2D) elCountSP2D.innerText = countSP2D;
}

// ==========================================
// FUNGSI MANAJEMEN PEMBAYARAN (SPM & SP2D)
// ==========================================

function initInputBayar() {
    // Jalankan update rincian setiap kali Bulan atau Golongan berubah
    $('#filterGolonganUM, #inputBulanBayar').on('change', function() {
        updateRincianBayar();
    });

    // Handle Submit Form
    const formBayar = document.getElementById('formPembayaranMassal');
    if (formBayar) {
        formBayar.addEventListener('submit', function(e) {
            e.preventDefault();
            const btn = $(e.submitter);
            const jenis = document.getElementById('jenisSurat').value;
            
            // Siapkan payload untuk dikirim ke Google Apps Script
            const payload = {
                action: jenis === 'SPM' ? 'updateSPM' : 'updateSP2D',
                bulan: document.getElementById('inputBulanBayar').value,
                golongan: document.getElementById('filterGolonganUM').value,
                // Mengirim data ke parameter yang sesuai di gs.txt
                noSPM: jenis === 'SPM' ? document.getElementById('inputNoDokumen').value : null,
                tglSPM: jenis === 'SPM' ? document.getElementById('inputTglDokumen').value : null,
                noSP2D: jenis === 'SP2D' ? document.getElementById('inputNoDokumen').value : null,
                tglSP2D: jenis === 'SP2D' ? document.getElementById('inputTglDokumen').value : null
            };

            // Panggil fungsi pengiriman data
            eksekusiSimpanPembayaran(payload, btn, formBayar);
        });
    }
}

function updateRincianBayar() {
    const golTerpilih = $('#filterGolonganUM').val(); 
    const bulanTerpilih = $('#inputBulanBayar').val();
    const currentYear = new Date().getFullYear();
    const formatBulan = `${currentYear}-${bulanTerpilih}`;
    
    if (!bulanTerpilih) {
        $('#areaRincianPembayaran').hide();
        return;
    }

    // Tarif statis (Sesuaikan jika Anda punya tabel tarif dinamis)
    const tarif = { 'IV': 41000, 'III': 37000, 'II': 35000, 'I': 35000 };
    const daftarLevelTampil = golTerpilih === "" ? ['IV', 'III', 'II', 'I'] : [golTerpilih];

    let rincianHTML = '<table class="table table-sm table-borderless mb-0" style="font-size: 0.8rem;"><tbody>';
    let grandTotal = 0;

    daftarLevelTampil.forEach(g => {
        // Filter pegawai berdasarkan level golongan
        const anggota = rawDataPegawai.filter(p => {
            const levelGol = (p.golongan || "").split('/')[0].trim();
            return levelGol === g; 
        });

        let totalHadirGrup = 0;
        anggota.forEach(p => {
            // Hitung jumlah HADIR dari log absensi
            const jmlHadir = globalLogs.filter(log => 
                log.nama === p.nama && 
                log.bulan === formatBulan && 
                log.status.toUpperCase() === "HADIR"
            ).length;
            totalHadirGrup += jmlHadir;
        });

        const nominalGrup = totalHadirGrup * (tarif[g] || 0);
        
        if (anggota.length > 0) {
            rincianHTML += `
                <tr>
                    <td class="text-muted">Gol. ${g} (${anggota.length} orang)</td>
                    <td class="text-end fw-bold">Rp ${nominalGrup.toLocaleString('id-ID')}</td>
                </tr>`;
            grandTotal += nominalGrup;
        }
    });

    rincianHTML += '</tbody></table>';
    
    if (grandTotal > 0) {
        $('#tabelRincianBayar').html(rincianHTML);
        $('#totalBayarUM').text(`Rp ${grandTotal.toLocaleString('id-ID')}`);
        $('#areaRincianPembayaran').slideDown();
    } else {
        $('#areaRincianPembayaran').hide();
    }
}
/**
 * Fungsi tunggal untuk mengeksekusi penyimpanan ke Server GAS
 */
async function eksekusiSimpanPembayaran(payload, $btn, formElement) {
    const originalContent = $btn.html();
    
    // Memberikan feedback visual loading
    $btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);

    try {
        // Menggunakan fetchPost yang sudah ada untuk mengirim format JSON 
        const response = await fetchPost(payload.action, payload);
        
        if (response.status === "success") {
            showToast(response.message, "success");
            formElement.reset();
            // Refresh data otomatis agar tabel terupdate [cite: 8]
            loadDataServer(true); 
        } else {
            showToast(response.message, "error");
        }
    } catch (error) {
        console.error('Error:', error);
        showToast("Gagal terhubung ke server: " + error.message, "error");
    } finally {
        // Mengembalikan tombol ke keadaan semula
        $btn.html(originalContent).prop('disabled', false);
    }
}

// Pastikan initInputBayar() dipanggil di dalam fungsi initUI() Anda


// Tambahkan listener ini di dalam fungsi initUI() Anda
function initBesaranUM() {
    const formUM = document.getElementById('formBesaranUM');
    if (!formUM) return;

    formUM.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const btn = $('#btnUpdateBesaran');
        const originalContent = btn.html();
        
        const payload = {
            bulan: "ALL", 
            tarif: {
                'IV': document.getElementById('umGol4').value,
                'III': document.getElementById('umGol3').value,
                'II': document.getElementById('umGol2').value,
                'I': document.getElementById('umGol2').value
            }
        };

        btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);

        try {
            // Mengirim ke action updateBesaranUM di GS
            const res = await fetchPost('updateBesaranUM', payload); 
            
            if (res.status === 'success') {
                showToast(res.message, 'success');
                formUM.reset(); 
                loadDataServer(true); // Memuat ulang data rekapan agar visual terupdate
            } else {
                showToast(res.message, 'error');
            }
        } catch (err) {
            showToast("Gagal terhubung ke server", "error");
        } finally {
            btn.html(originalContent).prop('disabled', false);
        }
    });
}
function renderTabelBesaranUM() {
    const tbody = document.getElementById('bodyBesaranUM');
    if (!tbody) return;

    // Inisialisasi tarif untuk ditampilkan di tabel rincian
    let tarifDitemukan = { 'IV': 0, 'III': 0, 'II': 0, 'I': 0 }; 

    // Scan data langsung dari rawDataPegawai (Data dari Tab Rekapan)
    if (rawDataPegawai && rawDataPegawai.length > 0) {
        rawDataPegawai.forEach(p => {
            // Ambil level golongan (IV, III, II, atau I)
            const level = (p.golongan || "").split('/')[0].trim();
            
            // Jika tarif untuk golongan ini belum ditemukan (masih 0), ambil dari data pegawai ini
            if (tarifDitemukan.hasOwnProperty(level) && tarifDitemukan[level] === 0) {
                // p.uangMakan ini adalah hasil mapping Kolom R (Index 17) dari GS
                const nominal = parseFloat(p.uangMakan) || 0; 
                
                if (nominal > 0) {
                    tarifDitemukan[level] = nominal;
                }
            }
        });
    }

    // Render ke dalam tabel
    let html = `
        <tr>
            <td class="p-3">Golongan IV</td>
            <td class="p-3 fw-bold text-primary">
                ${tarifDitemukan.IV > 0 ? 'Rp ' + tarifDitemukan.IV.toLocaleString('id-ID') : '<span class="text-muted small italic">Belum diatur</span>'}
            </td>
        </tr>
        <tr>
            <td class="p-3">Golongan III</td>
            <td class="p-3 fw-bold text-primary">
                ${tarifDitemukan.III > 0 ? 'Rp ' + tarifDitemukan.III.toLocaleString('id-ID') : '<span class="text-muted small italic">Belum diatur</span>'}
            </td>
        </tr>
        <tr>
            <td class="p-3">Golongan II / I</td>
            <td class="p-3 fw-bold text-primary">
                ${tarifDitemukan.II > 0 ? 'Rp ' + tarifDitemukan.II.toLocaleString('id-ID') : '<span class="text-muted small italic">Belum diatur</span>'}
            </td>
        </tr>
    `;

    tbody.innerHTML = html;

    // Opsional: Update label keterangan sumber data
    const labelBulan = document.getElementById('labelBulanAktifUM');
    if (labelBulan) {
        labelBulan.innerHTML = `<i class="fas fa-database me-1"></i> Sumber: Tab Rekapan (Kolom R)`;
    }
}