# Checklist kiểm thử

## Test tự động

Chạy:

```bash
npm test
```

Bộ test bao phủ chuẩn hóa proxy, proxy có thông tin xác thực, port mặc định HTTP/HTTPS, proxy sai định dạng, API key được che và nhận diện các trang login, CAPTCHA, payment, health và passport.

## Test thủ công end-to-end

Nên dùng tài khoản test và dữ liệu applicant không dùng cho hồ sơ thật. Đóng các Chrome cũ trước mỗi lần chạy sạch.

| ID | Tình huống | Kết quả mong đợi |
| --- | --- | --- |
| E2E-01 | Chạy một account không có `proxy` | Chrome mở bình thường và account chạy không có lỗi proxy. |
| E2E-02 | Chạy một account với proxy có xác thực | Log hiện host proxy riêng của account, không hiện password. |
| E2E-03 | Chạy bốn account với bốn profile | Bốn Chrome profile riêng được mở; lỗi một account không dừng các account khác. |
| E2E-04 | Trang login có đủ dấu hiệu nhận diện | Username/password được điền và navigation login được ghi log. |
| E2E-05 | Quốc gia đang `CLOSED` | Account refresh và chờ; không click quốc gia. |
| E2E-06 | Quốc gia chuyển sang `OPEN` | Log có `SELECT_COUNTRY ... OPEN`; dashboard bắt đầu tính thời gian từ mốc này. |
| E2E-07 | Có hồ sơ cũ | Log có `EXISTING_APPLICATION_DETECTED`; runner không click `OPEN_EXISTING` và chờ người dùng xoá hồ sơ cũ. |
| E2E-08 | Người dùng xoá hồ sơ cũ | Account nhận biết UI thay đổi và tiếp tục chọn quốc gia. |
| E2E-09 | CAPTCHA xuất hiện | Account ghi nhận CAPTCHA, chờ CapSolver và log kết quả giải/submit hoặc lỗi timeout rõ ràng. |
| E2E-10 | Các trang personal, passport, occupation, health, character | Field được điền và Next được click một lần trên mỗi trang. |
| E2E-11 | Đến trang payment | Dashboard đánh dấu `Payment ready` và hiện `PAYMENT_LINK` dạng link có thể click. |
| E2E-12 | Một account lỗi trong khi account khác thành công | Account lỗi được đánh dấu Error; kết quả các account khác vẫn hiển thị. |
| E2E-13 | Mở Runner log sau lần chạy trước | Danh sách raw log lịch sử được hiển thị, lọc được và đọc đầy đủ. |
| E2E-14 | Mở Previous results | Account lịch sử có thời gian bắt đầu, kết thúc, tổng thời gian, trạng thái và payment link nếu có. |
| E2E-15 | Tìm kiếm dashboard theo họ tên | Chỉ các dòng khớp tên còn hiển thị; xoá bộ lọc sẽ hiện lại tất cả. |
| E2E-16 | Không có CapSolver key | Log có `CapSolver API key MISSING`; lỗi được hiển thị rõ ràng, không im lặng. |

## Các marker cần kiểm tra trong log

Các marker quan trọng:

- `BROWSER_LAUNCH_READY`
- `CAPSOLVER_SYNC_DONE` or `CAPSOLVER_SYNC_ERROR`
- `SELECT_COUNTRY ... OPEN`
- `EXISTING_APPLICATION_DETECTED`
- `CAPTCHA solved`
- `PAYMENT_LINK`
- `ACCOUNT_FINISHED`
- `ACCOUNT_ERROR`
