# INZ Runner

## Tự động hóa quy trình hồ sơ nhanh hơn, rõ ràng hơn và có kiểm soát

INZ Runner là công cụ tự động hóa quy trình đăng ký hồ sơ trên nền tảng INZ, được xây dựng cho những công việc có nhiều bước lặp lại, yêu cầu theo dõi sát trạng thái trình duyệt và cần xử lý nhiều account trong cùng một lần chạy.

Thay vì phải mở từng cửa sổ Chrome, đăng nhập thủ công, điền lại những thông tin giống nhau và liên tục kiểm tra xem hệ thống đang ở bước nào, INZ Runner tổ chức toàn bộ quy trình thành một luồng tự động có thể quan sát, kiểm tra và dừng đúng lúc.

## Vì sao INZ Runner ưu việt?

### 1. Chạy nhiều account đồng thời

Mỗi account được chạy trên một Chrome profile và một tab riêng. Các profile hoạt động song song thay vì xếp hàng chờ nhau, giúp tận dụng tốt thời gian và rút ngắn tổng thời gian xử lý khi cần chuẩn bị nhiều hồ sơ.

Mô hình này cũng giúp mỗi account giữ được cookie, session và trạng thái đăng nhập riêng. Account này không làm ảnh hưởng đến account khác, đồng thời có thể tiếp tục sử dụng session đã lưu ở những lần chạy sau.

### 2. Tốc độ đến từ cách tổ chức, không chỉ từ việc click nhanh

INZ Runner nhanh vì loại bỏ những khoảng thời gian con người thường phải chờ và thao tác lặp:

- Khởi động các Chrome profile cùng lúc.
- Tự động điền dữ liệu applicant theo từng màn hình.
- Tự động bấm `Next` và chuyển tiếp giữa các bước.
- Theo dõi trạng thái trang thay vì đoán bằng thời gian chờ cố định.
- Tự phục hồi khi INZ báo hệ thống quá tải.
- Xử lý từng account độc lập, account nào hoàn tất sẽ được thông báo ngay.

Nhờ vậy, thời gian tổng thể được quyết định bởi account lâu nhất thay vì tổng thời gian của tất cả account cộng dồn tuần tự.

### 3. Dữ liệu dùng chung, hồ sơ được cá nhân hóa

Thông tin applicant được quản lý tập trung trong `applicant.json`, còn danh sách account nằm trong `emails.json`. Trước khi chạy từng account, app tạo một bản sao dữ liệu và thay email liên hệ tương ứng.

File dữ liệu gốc không bị sửa trong quá trình chạy. Cách làm này vừa giảm việc nhập liệu lặp lại, vừa hạn chế nguy cơ một account làm thay đổi dữ liệu của account khác.

### 4. Nhận diện trạng thái thông minh

Runner không chỉ chạy theo một chuỗi click cố định. Nó liên tục nhận diện trạng thái hiện tại của trang, bao gồm:

- CAPTCHA cần người dùng xử lý.
- Trang INZ đang quá tải.
- Session đăng nhập hết hạn.
- Các bước thông tin cá nhân, sức khỏe, nhân thân và WHS.
- Declaration và bước submit.
- Payment gateway.
- Trang không xác định.

Việc phân loại trạng thái giúp app biết nên tiếp tục, retry, chờ người dùng hay dừng lại. Đây là yếu tố quan trọng để tự động hóa ổn định hơn khi website phản hồi không đồng nhất.

### 5. Tự phục hồi khi hệ thống quá tải

Khi INZ trả về trạng thái high-load, runner không refresh liên tục một cách thiếu kiểm soát. App thực hiện retry theo số lần cấu hình được và áp dụng backoff tăng dần.

Cơ chế này giúp tận dụng cơ hội hệ thống hoạt động trở lại, đồng thời tránh tạo thêm áp lực lên server hoặc làm phiên chạy thất bại nhanh hơn vì request dồn dập.

### 6. CAPTCHA được xử lý đúng vai trò

INZ Runner có thể chờ CAPTCHA trong khoảng thời gian cấu hình và ghi nhận thời gian xử lý. Khi cần tương tác của người dùng, app dừng ở điểm phù hợp thay vì cố đoán hoặc bỏ qua trạng thái bảo vệ của website.

Nếu được cấu hình, CapSolver extension có thể được nạp riêng vào từng Chrome profile. API key không nên đặt trong mã nguồn hoặc tài liệu công khai.

### 7. Minh bạch từ log đến thông báo

Mỗi lần chạy tạo log tổng và log riêng cho từng account. Người vận hành có thể biết:

- Account đang ở URL nào.
- Đã đi qua những bước nào.
- Field nào được điền hoặc không tìm thấy.
- Có request lỗi, CAPTCHA hay high-load hay không.
- Runner dừng ở đâu và vì lý do gì.

Khi một account hoàn tất hoặc gặp lỗi, app có thể gửi thông báo Telegram ngay lập tức, không cần chờ các account khác. Điều này đặc biệt hữu ích khi chạy nhiều account trong nền.

## Hai cách sử dụng, một lõi xử lý

### Chạy bằng terminal

Phù hợp khi cần chạy nhanh, tự động hóa trong môi trường kỹ thuật hoặc tích hợp vào quy trình riêng:

```bash
npm start
```

### Điều khiển bằng app desktop

Phù hợp khi muốn theo dõi trực quan. Giao diện desktop cung cấp các thao tác chính:

- Start runner.
- Stop.
- Xem log realtime.
- Nhập và xuất `applicant.json`, `emails.json`.
- Cập nhật country, Telegram và CapSolver API key trong Settings.

App có thể được đóng gói cho macOS và Windows, giúp người dùng vận hành mà không cần thao tác trực tiếp với toàn bộ mã nguồn.

## Điểm dừng an toàn

Tự động hóa tốt không có nghĩa là tự động làm mọi thứ một cách mù quáng. INZ Runner chủ động dừng khi:

- Gặp CAPTCHA cần người dùng xử lý.
- Không nhận diện được trang.
- Không tìm thấy nút hoặc bước tiếp theo.
- Đạt giới hạn số trang wizard.
- Đến declaration.
- Đến payment, nơi app không nhập thông tin thẻ.

Các điểm dừng này giúp người vận hành giữ quyền kiểm tra những bước nhạy cảm và tránh để một thay đổi bất ngờ của website dẫn đến thao tác ngoài dự kiến.

## Kiến trúc gọn, dễ bảo trì

Ứng dụng được chia thành các lớp rõ ràng: khởi động và điều phối, cấu hình, browser profile, đăng nhập, nhận diện trang, tương tác DOM, mapping form, phục hồi lỗi, logging và notification.

Khi website thay đổi, selector có thể được cập nhật tại lớp selector thay vì phải sửa toàn bộ flow. Khi thêm một nhóm form mới, logic có thể đặt trong `src/forms/`. Cấu trúc này giúp việc debug nhanh hơn và giảm rủi ro khi mở rộng.

## Tóm lại

INZ Runner biến một quy trình nhiều bước, dễ tốn thời gian và khó theo dõi thành một hệ thống chạy song song, có trạng thái, có log và có kiểm soát.

Giá trị nổi bật của app nằm ở sự kết hợp giữa:

- **Tốc độ:** xử lý nhiều account đồng thời.
- **Ổn định:** profile riêng, nhận diện trạng thái và retry có backoff.
- **Tiết kiệm công sức:** tự động điền form và điều hướng.
- **Minh bạch:** log chi tiết và thông báo theo từng account.
- **An toàn vận hành:** dừng ở CAPTCHA, declaration và payment.
- **Dễ phát triển:** kiến trúc module hóa, selector và form tách biệt.

Đây không chỉ là một script tự động click. Đây là một runner được thiết kế để biến thời gian chờ và thao tác lặp lại thành một quy trình có thể điều phối, quan sát và kiểm soát.