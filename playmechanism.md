# Play Mechanism: Ô Ăn Quan

## Chế độ chơi

- Bản này là người chơi đấu với máy trên cùng một màn hình.
- Bạn điều khiển 5 ô dân hàng dưới.
- Máy điều khiển 5 ô dân hàng trên.
- Bạn đi trước; sau khi lượt của bạn hoàn tất, máy đợi một nhịp ngắn rồi tự chọn nước đi.

## Bàn và quân

- Bàn có 12 vị trí theo vòng: 2 ô quan ở hai đầu, 10 ô dân thành 2 hàng 5 ô.
- Mỗi ô dân khởi đầu với 5 quân dân.
- Mỗi ô quan khởi đầu với 1 quân quan lớn.
- Một quân quan được tính bằng 10 dân trong bản game này.

## Lượt chơi

1. Người đến lượt chọn một ô dân thuộc phía mình đang có quân.
2. Nếu là bạn, canvas hiện 2 mũi tên trái/phải cạnh ô vừa chọn; bấm mũi tên nào thì rải theo hướng đó. Nếu là máy, máy tự chọn cả ô và hướng.
3. Toàn bộ quân dân trong ô được bốc lên.
4. Quân được rải tuần tự, mỗi frame chỉ thêm 1 viên vào ô kế tiếp theo chiều đã chọn.
5. Sau khi rải hết:
   - Nếu ô kế tiếp có quân dân và không phải ô quan, bốc tiếp ô đó rồi tiếp tục rải tuần tự cùng chiều.
   - Nếu ô kế tiếp là ô trống và ô sau nó có quân, lượt tạm dừng để xác nhận ăn.
   - Nếu ô kế tiếp là ô quan còn quân quan, lượt dừng.

## Ăn quân

- Nếu sau khi rải, ô kế tiếp trống và ô sau nó có quân, ô trống đó được highlight màu vàng.
- Người chơi phải bấm vào ô trống màu vàng để ăn toàn bộ quân ở ô sau đó. Máy sẽ tự bấm sau một nhịp ngắn.
- Có thể ăn liên tiếp; sau mỗi lần ăn, nếu lại có một ô trống rồi tới một ô có quân, game tiếp tục dừng và yêu cầu bấm ô trống kế tiếp.
- Khi ăn ô quan, người chơi nhận cả quân quan và dân nằm trong ô quan.
- Bản game này dùng luật dễ chơi: dân nằm trong ô quan sau khi quan đã bị ăn vẫn có thể bị ăn như quân thường.

## Máy chơi

- Máy xét tất cả ô hợp lệ trên hàng trên với cả hai chiều rải.
- Mỗi nước được mô phỏng bằng cùng engine luật của người chơi.
- Máy ưu tiên nước ăn được nhiều điểm trực tiếp trong lượt đó, sau đó ưu tiên giữ lại nhiều dân ở phía mình.
- Khi chấm điểm nước đi, máy không tính phần điểm thu dân cuối ván, để tránh chọn nước chỉ vì cú quét điểm sau khi hết hai quan.
- Nếu còn nước không kết thúc ván, máy ưu tiên nhóm nước đó trước; chỉ khi không còn lựa chọn hợp lệ khác thì mới chọn nước kết thúc ván.
- Đây là AI một lượt nhìn trước, không phải minimax nhiều tầng.

## Animation

- `buildMoveTrace` sinh một danh sách frame từ một nước đi.
- Frame `pickup` hiển thị ô vừa được bốc hết quân.
- Frame `drop` hiển thị từng viên được rải vào từng ô kế tiếp.
- Frame `capturePrompt` dừng animation ở ô trống màu vàng và chờ xác nhận ăn.
- Frame `capture` hiển thị ô vừa bị ăn sau khi xác nhận.
- UI dùng các ảnh trong `src/asset/hand` để vẽ tay lên canvas: `hand_catch_stone.png` cho thao tác bốc/ăn, các pose `left_*`, `right_*`, `90.png` cho thao tác rải và chờ ăn.
- Frame `finish` là trạng thái cuối cùng của lượt, sau đó mới chuyển input cho bên kế tiếp.
- Trong lúc animation chạy, người chơi không thể chọn ô mới, chọn hướng, hoặc undo.

## Hết quân trên phía mình

- Khi tới lượt mà 5 ô dân phía người chơi hoặc máy đều trống, hệ thống tự gieo lại 1 dân vào mỗi ô phía đó.
- Bên được gieo lại bị trừ 5 dân khỏi điểm đã ăn.
- Nếu chưa đủ điểm, điểm dân có thể âm, biểu thị đang mượn quân.

## Kết thúc

- Khi cả 2 quân quan đã bị ăn, ván kết thúc.
- Dân còn lại trong 5 ô phía máy được cộng cho máy.
- Dân còn lại trong 5 ô phía bạn được cộng cho bạn.
- Dân lẻ còn nằm trong ô quan, nếu có, được cộng cho bên vừa tạo trạng thái hết quan để tránh trạng thái mơ hồ trong bản số hóa.
- Người có tổng điểm cao hơn thắng. Tổng điểm = dân đã ăn + quan đã ăn x 10.

## Dữ liệu trạng thái

- `cells`: 12 ô theo vòng rải.
- Mỗi ô có `type`, `citizens`, `mandarins`.
- `currentPlayer`: `0` là máy, `1` là bạn.
- `scores`: số dân và quan đã ăn của từng bên.
- `direction`: `1` là theo chiều kim đồng hồ, `-1` là ngược chiều kim đồng hồ.
- `history`: stack trạng thái để undo.
- `log`: mô tả các sự kiện chính trong lượt.
