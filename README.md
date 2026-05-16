# pp-automation

PP Automation adalah starter web app offline-first untuk manajemen aset, history perbaikan, dan role-based UI. Aplikasi ini dirancang agar mudah dikembangkan menjadi APK Android melalui PWA wrapper seperti Capacitor atau TWA.

## Fitur utama
- Login role-based `admin` / `engineer`
- Area management dan role assignment
- Asset management dengan QR code untuk setiap asset
- History perbaikan lengkap, termasuk siapa, area, dan catatan
- Offline mode dengan service worker dan `localStorage`
- Auto-sync saat kembali online
- Audit log untuk login, logout, asset, perbaikan, area, dan user
- Custom menu builder yang disimpan di browser
- Deploy otomatis ke GitHub Pages

## Login demo
- `admin@demo` / `demo123`
- `user@lapangan` / `lapangan123`

## Struktur halaman
- Dashboard
- Asset & QR
- History Perbaikan
- Sync Otomatis
- Custom Menu
- User Management (admin)
- Area Management (admin)
- Audit Log (admin)

## Cara pakai
1. Push repository ke GitHub.
2. Buka `index.html` secara lokal atau jalankan di GitHub Pages.
3. Login menggunakan akun demo.
4. Tambah asset dan riwayat. Semua data akan tetap tersimpan saat offline.

## Deploy GitHub Pages
Workflow `/.github/workflows/pages.yml` akan menerbitkan halaman setiap push ke branch `main`.

## Build APK
- Aplikasi sudah disiapkan dengan Capacitor dan Android wrapper di project.
- File APK dapat dibangun otomatis menggunakan workflow `/.github/workflows/build-apk.yml`.
- Setelah workflow selesai, APK akan tersedia sebagai artifact di GitHub Actions.

## Sync Server
- Untuk membuat data web dan Android sinkron, jalankan server sinkronisasi lokal dengan `npm run start-server`.
- Aplikasi tetap bekerja offline karena data disimpan di `localStorage`.
- Saat perangkat kembali online, data akan otomatis dikirim ke server dan disinkronkan.
- Untuk Android emulator lokal, app akan menggunakan `http://10.0.2.2:3000`.
- Untuk web lokal di browser, app akan gunakan `http://localhost:3000`.
- Untuk perangkat nyata atau jika web dipakai lewat GitHub Pages, ganti `DEFAULT_SYNC_SERVER` di `app.js` dengan URL server yang dapat diakses dari jaringan / internet.

## Catatan teknis
- Data aplikasi disimpan di `localStorage`, sehingga bisa digunakan offline.
- Service worker di `sw.js` meng-cache file statis untuk akses cepat.
- PWA metadata ditambahkan di `index.html` untuk pengalaman mobile lebih baik.
- Untuk membuat APK secara manual, jalankan `npm run build` dan kemudian `cd android && ./gradlew assembleDebug` pada mesin dengan Android SDK.
