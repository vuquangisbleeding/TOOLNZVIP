# Puppeteer multi-tab applicant runner

Xem [ARCHITECTURE_VI.md](ARCHITECTURE_VI.md) để hiểu luồng chạy, trách nhiệm từng module và cách debug trước khi phát triển tiếp.

Tool này mở **một Chrome profile riêng và đúng một tab cho mỗi tài khoản** trong `emails.json`. Mỗi profile có cookie/session Google riêng, nên tài khoản này không dùng chung trạng thái đăng nhập với tài khoản khác. Mọi dữ liệu khác được đọc từ `applicant.json`; trước khi chạy từng profile, tool tạo một bản sao dữ liệu và thay `contact.email` bằng email tương ứng.

## Cài đặt

```bash
npm install
cp .env.example .env
```

Kiểm tra `LOGIN_URL` trong `.env`, sau đó sửa danh sách email trong `emails.json`:

`SCHEME_COUNTRY=CROATIA` là nước được chọn trên màn hình quota. Đổi giá trị này khi muốn chọn nước khác. Runner click thẻ `<a>` có id `..._createLink_<index>` tương ứng với country và chỉ click khi `countryStatus_<index>` là `OPEN`. Nếu card đang `CLOSED`, runner sẽ chờ `COUNTRY_POLL_MS` (mặc định 500ms), refresh lại trang và lặp đến khi card chuyển `OPEN`; không tự dừng vì trạng thái đóng.

```json
[
  {
    "username": "quangnv0212nzz",
    "password": "Vuquang02122000@"
    ,"email": "quangnv.ftuforum@gmail.com"
  },
  {
    "email": "email-2@example.com",
    "password": "password-2"
  },
  {
    "email": "email-3@example.com",
    "password": "password-3",
    "proxy": "http://proxy-host-3:8080"
  }
]
```

Mỗi object tương ứng với một Chrome profile/process và một tab duy nhất. Trường `username` và `password` dùng để đăng nhập; trường `email` dùng trong hồ sơ applicant. Trường `proxy` là tùy chọn và chỉ áp dụng cho profile đó, vì vậy mỗi profile có thể dùng một IP khác nhau. Có thể dùng proxy không xác thực:

```json
"proxy": "http://proxy-host:8080"
```

Hoặc proxy có tài khoản/mật khẩu:

```json
"proxy": "http://proxy-user:proxy-password@proxy-host:8080"
```

Để không ghi thông tin đăng nhập proxy trong URL, dùng object tương đương:

```json
"proxy": {
  "server": "http://proxy-host:8080",
  "username": "proxy-user",
  "password": "proxy-password"
}
```

Muốn chạy 3 account riêng thì để 3 object. Không cần tạo 3 bản sao `applicant.json`.

## Chạy

```bash
npm start
```

## App desktop macOS/Windows

Mở giao diện điều khiển bằng:

```bash
npm run desktop
```

App có nút `Start runner`, `Stop` và cửa sổ log realtime. Runner vẫn chạy các profile song song như khi dùng `npm start`.

Trong mục `Applicant data`, có thể nhập tay hoặc `Import`/`Export` hai file `applicant.json` và `emails.json`. Mục `Settings` cho phép sửa trực tiếp `SCHEME_COUNTRY`, `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`; CapSolver API key chỉ được đọc từ `assets/config.js`. Khi packaged, các giá trị được lưu trong thư mục dữ liệu riêng của app.

Đóng gói trên macOS:

```bash
npm run dist:mac
```

Đóng gói trên Windows:

```bash
npm run dist:win
```

Lệnh build Windows cần chạy trên Windows; lệnh build macOS cần chạy trên macOS. Khi app packaged chạy lần đầu, các file `applicant.json`, `emails.json`, `.env` và extension được copy vào thư mục dữ liệu riêng của app để có quyền ghi log và Chrome profiles. Hãy sửa `.env` trong thư mục dữ liệu đó nếu cần đổi cấu hình.

Mỗi lần chạy tạo một file log tổng và một file riêng cho từng account trong thư mục `logs/`. Terminal sẽ in các dòng `LOG_FILE ...` và `ACCOUNT_LOG_FILE ...`; mở file account tương ứng để xem riêng từng bước, URL, request lỗi, CAPTCHA, high-load và vị trí runner dừng. CAPTCHA được chờ tự động trong tối đa `CAPTCHA_TIMEOUT_MS`, không cần nhấn Enter.

Ngay khi từng account kết thúc hoặc gặp lỗi, runner gửi một tin nhắn Telegram riêng, không chờ account khác. Tin nhắn gồm thời gian chạy, thời gian giải CAPTCHA và thông tin cơ bản của applicant. Điền bot token (key) và chat ID vào `.env`:

```dotenv
TELEGRAM_BOT_TOKEN=KEY_CUA_BOT
TELEGRAM_CHAT_ID=CHAT_ID_CUA_BAN
```

Telegram là tùy chọn; nếu để trống, runner vẫn chạy và ghi rõ lý do bỏ qua trong log.

Các Chrome profile được bắt đầu đồng thời. Profile được lưu trong thư mục `chrome-profiles/account-1`, `account-2`, ... để cookie/session của từng account được tách riêng và giữ lại cho lần chạy sau. Bot tự điền các field đã có selector theo pseudocode Selenium, nhấn `Next`, và dừng khi:

- gặp CAPTCHA để người dùng xử lý;
- gặp trang INZ báo quá tải: tự retry tối đa `MAX_HIGH_LOAD_RETRIES` lần với backoff tăng dần;
- không nhận diện được trang;
- tới declaration;
- tới payment, không nhập thông tin thẻ;
- không tìm thấy nút tiếp theo;
- đạt `MAX_WIZARD_PAGES`.

## CapSolver

API key không lấy từ `.env`, giao diện hoặc Chrome profile. Chỉ sửa key trong file:

```text
CapSolver.Browser.Extension-chrome-v1.7.1/assets/config.js
```

Mở file đó và thay:

```js
apiKey: '',
```

thành:

```js
apiKey: 'API_KEY_CUA_BAN',
```

Sau đó kiểm tra `.env` có đường dẫn:

```dotenv
CAPSOLVER_EXTENSION_PATH=./CapSolver.Browser.Extension-chrome-v1.7.1
CAPSOLVER_EXTENSION_ID=mbfeabdjfagoifkpcikdaneggoimeidb
```

Runner sẽ ghi key vào `assets/config.js` trước khi nạp extension bằng Puppeteer, đúng theo hướng dẫn tích hợp chính thức của CapSolver. Không đưa API key vào `README.md`, `emails.json` hoặc git.

## Lưu ý

- Không đưa `.env` vào git nếu sau này bạn bổ sung thông tin nhạy cảm.
- Đóng toàn bộ Chrome trước khi chạy lại nếu một profile báo đang được sử dụng.
- Chạy nhiều account cùng lúc có thể bị website giới hạn session.
- Không nên đặt `HIGH_LOAD_BACKOFF_MS` quá thấp: lỗi này do server quá tải, refresh liên tục có thể làm request bị từ chối lâu hơn.
- Các selector trong `src/runner.js` là lớp mapping ban đầu theo pseudocode. Nếu HTML thực tế khác, cập nhật các selector suffix tương ứng.
