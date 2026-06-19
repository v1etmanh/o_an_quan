# Design: Ô Ăn Quan Canvas

## Mục tiêu

Trò chơi là một bản ô ăn quan người chơi đấu với máy, dùng React để quản lý trạng thái và HTML Canvas để vẽ bàn chơi. Trải nghiệm ưu tiên cảm giác dân gian, ấm, gần mặt đất, giống góc nhìn trong ảnh tham chiếu: người chơi ngồi đối diện máy, bàn vẽ trên nền gỗ/nền đất, các viên dân nhỏ nổi bật bằng xanh lam, hai quân quan là đá lớn màu xám.

## Nguồn tham khảo luật

- Wikipedia mô tả bàn chơi gồm 10 ô dân theo lưới 5x2 và 2 ô quan hình bán nguyệt ở hai đầu; mỗi ô dân thường có 5 quân, mỗi ô quan có 1 quân lớn; người chơi chọn ô phía mình để rải quân và ăn khi gặp ô trống rồi tới ô có quân: https://en.wikipedia.org/wiki/%C3%94_%C4%83n_quan
- FPT Shop mô tả luật 2 người: bàn chữ nhật 10 ô vuông + 2 bán nguyệt, mỗi người kiểm soát 5 ô, rải xuôi hoặc ngược chiều, tiếp tục rải khi ô kế có quân, ăn quân sau một ô trống, hết 2 quan thì chia dân còn lại theo phía kiểm soát: https://fptshop.com.vn/tin-tuc/danh-gia/luat-choi-o-an-quan-185203

## Hướng mỹ thuật

- Góc nhìn: top-down xiên nhẹ, đầu bàn xa nhỏ hơn đầu bàn gần để gợi phối cảnh trong ảnh mẫu.
- Chất liệu: nền ván gỗ nâu có vệt cọ, khe ván, ánh sáng ấm.
- Bàn chơi: đường vẽ đen sẫm như vạch than/phấn trên nền, hình capsule dài với 5 cột ô dân và 2 ô quan bo tròn.
- Quân dân: viên sỏi xanh lam, nhỏ, xếp cụm có jitter cố định để trông tự nhiên nhưng không nhảy layout.
- Quân quan: viên đá lớn xám, texture loang và bóng nhẹ.
- Nhân vật: vẽ gợi hình bằng canvas ở rìa trên/dưới, không che bàn; áo xanh ở phía trên, tay áo đỏ ở phía dưới, giống bố cục ảnh tham chiếu.

## Bố cục UI

- Màn hình chính là game board, không làm landing page.
- Canvas chiếm vùng lớn nhất; panel điều khiển nằm cạnh phải trên desktop và nằm dưới canvas trên mobile.
- Điều khiển gồm reset, undo, trạng thái lượt, điểm của bạn/máy và nhật ký lượt gần nhất.
- Các ô hợp lệ phía người chơi được highlight. Người chơi bấm một ô dân hàng dưới, sau đó canvas hiện 2 mũi tên trái/phải cạnh ô để chọn hướng rải; máy tự chọn nước đi ở hàng trên.
- Mỗi lượt chạy bằng animation tuần tự: bốc quân, thả từng viên vào từng ô, bốc tiếp nếu đúng luật. Khi có thế ăn, bàn dừng ở ô trống màu vàng; người chơi bấm ô đó để ăn ô kế tiếp rồi lượt mới tiếp tục.
- Nhân vật hai phía dùng ảnh avatar nền trong suốt ở `src/asset`: bé ngồi phía trên đại diện máy, người chơi áo đỏ ở mép dưới đại diện bạn; canvas resize ảnh theo tỉ lệ gốc để giữ đúng phong cách tranh.
- Âm thanh dùng `src/asset/sound`: nhạc nền `music.mp3` loop âm lượng thấp sau tương tác đầu tiên; `rai_da.wav` phát theo từng viên rải; khi người chơi có thế ăn, họ có 3 giây click ô vàng và `player_click_square.wav` vang lớn dần theo số click; máy dùng `enemy_click_square.wav`.
- AI được cân bằng để không cố tình tận dụng điểm thu cuối ván quá sớm; máy chấm điểm theo phần ăn trực tiếp trước, rồi mới xét các yếu tố phụ.

## Responsive

- Canvas giữ tỉ lệ 16:10 với kích thước tối đa để bàn không bị méo.
- Panel dùng grid responsive, tự chuyển thành một cột trên màn hình nhỏ.
- Font không scale theo viewport; chỉ thay đổi layout bằng width/height constraints.

## Không làm trong bản đầu

- Không multiplayer online.
- Không AI.
- Không kéo thả từng viên khi rải; lượt được thực hiện tức thì, có log và highlight để người chơi hiểu kết quả.
- Không dùng ảnh bitmap ngoài; toàn bộ phong cách được dựng bằng canvas để app chạy độc lập.
