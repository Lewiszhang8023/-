import base64
import io
import re
import socket
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import qrcode
import streamlit as st

DB_PATH = Path("equipment.db")
STATUS_OPTIONS = ["在库", "借出", "维修", "停用"]
CATEGORY_OPTIONS = ["机身", "镜头", "灯光", "稳定器", "录音", "配件", "其他"]

st.set_page_config(
    page_title="摄影器材出入库管理",
    page_icon="📷",
    layout="wide",
)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(cur, table_name, column_name, definition):
    columns = [row[1] for row in cur.execute(f"PRAGMA table_info({table_name})").fetchall()]
    if column_name not in columns:
        cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def init_db():
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                category TEXT,
                brand TEXT,
                model TEXT,
                serial_no TEXT,
                location TEXT,
                status TEXT DEFAULT '在库',
                quantity INTEGER DEFAULT 1,
                available_quantity INTEGER DEFAULT 1,
                keeper TEXT,
                borrower TEXT DEFAULT '',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS stock_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_code TEXT NOT NULL,
                action TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                operator TEXT,
                target_person TEXT,
                remark TEXT,
                action_time TEXT NOT NULL
            )
            """
        )
        ensure_column(cur, "equipment", "borrower", "TEXT DEFAULT ''")
        conn.commit()


def run_query(query, params=()):
    with closing(get_conn()) as conn:
        return pd.read_sql_query(query, conn, params=params)


def execute(query, params=()):
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(query, params)
        conn.commit()


def add_equipment(data):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(
        """
        INSERT INTO equipment (
            asset_code, name, category, brand, model, serial_no,
            location, status, quantity, available_quantity, keeper,
            borrower, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["asset_code"],
            data["name"],
            data["category"],
            data["brand"],
            data["model"],
            data["serial_no"],
            data["location"],
            data["status"],
            data["quantity"],
            data["available_quantity"],
            data["keeper"],
            data["borrower"],
            data["notes"],
            now,
            now,
        ),
    )


def update_equipment(row_id, data):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(
        """
        UPDATE equipment
        SET name=?, category=?, brand=?, model=?, serial_no=?,
            location=?, status=?, quantity=?, available_quantity=?,
            keeper=?, borrower=?, notes=?, updated_at=?
        WHERE id=?
        """,
        (
            data["name"],
            data["category"],
            data["brand"],
            data["model"],
            data["serial_no"],
            data["location"],
            data["status"],
            data["quantity"],
            data["available_quantity"],
            data["keeper"],
            data["borrower"],
            data["notes"],
            now,
            row_id,
        ),
    )


def add_stock_log(asset_code, action, quantity, operator, target_person, remark):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(
        """
        INSERT INTO stock_logs (asset_code, action, quantity, operator, target_person, remark, action_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (asset_code, action, quantity, operator, target_person, remark, now),
    )


def parse_asset_code(raw_text):
    if not raw_text:
        return ""
    match = re.search(r"设备编码[:：]\s*(.+)", raw_text)
    return (match.group(1) if match else raw_text).strip()


def generate_qr_bytes(asset_code):
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(f"设备编码: {asset_code}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def decode_qr_image(uploaded_image):
    file_bytes = np.asarray(bytearray(uploaded_image.read()), dtype=np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if image is None:
        return ""
    detector = cv2.QRCodeDetector()
    value, _, _ = detector.detectAndDecode(image)
    return parse_asset_code(value)


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def import_excel(file):
    xls = pd.ExcelFile(file)
    imported = 0
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        df.columns = [str(c).strip() for c in df.columns]
        for _, row in df.iterrows():
            asset_code = str(row.get("设备编码") or row.get("资产编码") or "").strip()
            name = str(row.get("设备名称") or row.get("名称") or "").strip()
            if not asset_code or not name:
                continue
            exists = run_query("SELECT id FROM equipment WHERE asset_code = ?", (asset_code,))
            if not exists.empty:
                continue
            qty = int(row.get("数量") or 1)
            borrower = str(row.get("借用人") or row.get("领用人") or "").strip()
            add_equipment(
                {
                    "asset_code": asset_code,
                    "name": name,
                    "category": str(row.get("分类") or "未分类"),
                    "brand": str(row.get("品牌") or ""),
                    "model": str(row.get("型号") or ""),
                    "serial_no": str(row.get("序列号") or ""),
                    "location": str(row.get("库位") or "总仓"),
                    "status": str(row.get("状态") or ("借出" if borrower else "在库")),
                    "quantity": qty,
                    "available_quantity": int(row.get("可用数量") or (0 if borrower else qty)),
                    "keeper": str(row.get("负责人") or ""),
                    "borrower": borrower,
                    "notes": str(row.get("备注") or ""),
                }
            )
            imported += 1
    return imported, xls.sheet_names


def process_stock_action(selected, action, qty, operator, target_person, remark):
    current_available = int(selected["available_quantity"])
    total_qty = int(selected["quantity"])
    new_available = current_available - int(qty) if action == "出库" else current_available + int(qty)
    if new_available < 0 or new_available > total_qty:
        return False, "数量不合法，请检查当前库存。"
    new_status = selected["status"]
    new_borrower = selected["borrower"] or ""
    if action == "出库":
        new_status = "借出" if new_available < total_qty else "在库"
        if target_person:
            new_borrower = target_person
    else:
        if new_available == total_qty:
            new_status = "在库"
            new_borrower = ""
        elif target_person:
            new_borrower = target_person
    update_equipment(
        int(selected["id"]),
        {
            "name": selected["name"],
            "category": selected["category"],
            "brand": selected["brand"],
            "model": selected["model"],
            "serial_no": selected["serial_no"],
            "location": selected["location"],
            "status": new_status,
            "quantity": total_qty,
            "available_quantity": new_available,
            "keeper": selected["keeper"],
            "borrower": new_borrower,
            "notes": selected["notes"],
        },
    )
    add_stock_log(selected["asset_code"], action, int(qty), operator, target_person, remark)
    return True, f"{selected['asset_code']} {action}登记成功。"


init_db()

equipment_df = run_query("SELECT * FROM equipment ORDER BY updated_at DESC")
log_df = run_query("SELECT * FROM stock_logs ORDER BY action_time DESC")
local_ip = get_local_ip()

st.title("📷 摄影器材设备出入库管理")
st.caption("适合本地化部署的轻量设备管理程序：支持 Excel 导入、库内编辑、手机扫码出入库与二维码标识。")

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("设备总数", int(equipment_df["quantity"].sum()) if not equipment_df.empty else 0)
with col2:
    st.metric("当前可用", int(equipment_df["available_quantity"].sum()) if not equipment_df.empty else 0)
with col3:
    st.metric("设备种类", equipment_df["asset_code"].count())
with col4:
    st.metric("出入库记录", len(log_df))

tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([
    "总览看板",
    "设备台账",
    "出入库登记",
    "手机扫码",
    "二维码管理",
    "Excel 导入",
])

with tab1:
    left, right = st.columns([1.3, 1])
    with left:
        st.subheader("库内设备概览")
        if equipment_df.empty:
            st.info("还没有设备数据，请先在“设备台账”中新增，或在“Excel 导入”中导入。")
        else:
            show_cols = [
                "asset_code",
                "name",
                "category",
                "location",
                "status",
                "available_quantity",
                "borrower",
                "keeper",
            ]
            st.dataframe(equipment_df[show_cols], use_container_width=True, hide_index=True)
    with right:
        st.subheader("状态分布")
        if equipment_df.empty:
            st.info("暂无图表数据。")
        else:
            status_chart = equipment_df.groupby("status", as_index=False)["asset_code"].count()
            st.bar_chart(status_chart.set_index("status"))
        st.subheader("近期操作记录")
        if log_df.empty:
            st.info("暂无出入库记录。")
        else:
            log_show_cols = ["asset_code", "action", "quantity", "target_person", "operator", "action_time"]
            st.dataframe(log_df[log_show_cols].head(10), use_container_width=True, hide_index=True)

with tab2:
    st.subheader("设备台账维护")
    with st.expander("新增设备", expanded=equipment_df.empty):
        with st.form("add_equipment"):
            c1, c2, c3 = st.columns(3)
            asset_code = c1.text_input("设备编码 *", placeholder="CAM-2026-001")
            name = c2.text_input("设备名称 *", placeholder="Sony FX3")
            category = c3.selectbox("分类", CATEGORY_OPTIONS)
            c4, c5, c6 = st.columns(3)
            brand = c4.text_input("品牌")
            model = c5.text_input("型号")
            serial_no = c6.text_input("序列号")
            c7, c8, c9, c10 = st.columns(4)
            location = c7.text_input("库位", value="总仓")
            status = c8.selectbox("状态", STATUS_OPTIONS)
            quantity = c9.number_input("数量", min_value=1, value=1)
            keeper = c10.text_input("负责人")
            borrower = st.text_input("借用人", placeholder="当前借出时填写")
            notes = st.text_area("备注")
            submitted = st.form_submit_button("保存设备")
            if submitted:
                if not asset_code or not name:
                    st.error("设备编码和设备名称为必填项。")
                else:
                    try:
                        add_equipment(
                            {
                                "asset_code": asset_code,
                                "name": name,
                                "category": category,
                                "brand": brand,
                                "model": model,
                                "serial_no": serial_no,
                                "location": location,
                                "status": status,
                                "quantity": int(quantity),
                                "available_quantity": 0 if borrower and status == "借出" else int(quantity),
                                "keeper": keeper,
                                "borrower": borrower,
                                "notes": notes,
                            }
                        )
                        st.success(f"设备 {asset_code} 已新增。")
                        st.rerun()
                    except sqlite3.IntegrityError:
                        st.error("设备编码已存在，请使用唯一编码。")

    st.subheader("库内编辑")
    if equipment_df.empty:
        st.info("暂无设备可编辑。")
    else:
        selected_code = st.selectbox("选择设备", equipment_df["asset_code"].tolist())
        selected_row = equipment_df.loc[equipment_df["asset_code"] == selected_code].iloc[0]
        with st.form("edit_equipment"):
            e1, e2, e3 = st.columns(3)
            edit_name = e1.text_input("设备名称", value=selected_row["name"])
            edit_category = e2.text_input("分类", value=selected_row["category"])
            edit_brand = e3.text_input("品牌", value=selected_row["brand"])
            e4, e5, e6 = st.columns(3)
            edit_model = e4.text_input("型号", value=selected_row["model"])
            edit_serial = e5.text_input("序列号", value=selected_row["serial_no"])
            edit_location = e6.text_input("库位", value=selected_row["location"])
            e7, e8, e9, e10 = st.columns(4)
            edit_status = e7.selectbox("状态", STATUS_OPTIONS, index=STATUS_OPTIONS.index(selected_row["status"]))
            edit_quantity = e8.number_input("总数量", min_value=1, value=int(selected_row["quantity"]))
            edit_available = e9.number_input("可用数量", min_value=0, value=int(selected_row["available_quantity"]))
            edit_keeper = e10.text_input("负责人", value=selected_row["keeper"])
            edit_borrower = st.text_input("借用人", value=selected_row["borrower"] or "")
            edit_notes = st.text_area("备注", value=selected_row["notes"] or "")
            updated = st.form_submit_button("更新设备")
            if updated:
                update_equipment(
                    int(selected_row["id"]),
                    {
                        "name": edit_name,
                        "category": edit_category,
                        "brand": edit_brand,
                        "model": edit_model,
                        "serial_no": edit_serial,
                        "location": edit_location,
                        "status": edit_status,
                        "quantity": int(edit_quantity),
                        "available_quantity": int(edit_available),
                        "keeper": edit_keeper,
                        "borrower": edit_borrower,
                        "notes": edit_notes,
                    },
                )
                st.success(f"设备 {selected_code} 已更新。")
                st.rerun()

with tab3:
    st.subheader("出入库登记")
    if equipment_df.empty:
        st.info("请先添加设备后再登记出入库。")
    else:
        with st.form("stock_form"):
            s1, s2, s3 = st.columns(3)
            stock_asset_code = s1.selectbox("设备编码", equipment_df["asset_code"].tolist())
            action = s2.selectbox("操作类型", ["出库", "入库"])
            qty = s3.number_input("数量", min_value=1, value=1)
            s4, s5 = st.columns(2)
            operator = s4.text_input("经办人")
            target_person = s5.text_input("借用/归还人")
            remark = st.text_area("说明")
            stock_submit = st.form_submit_button("提交登记")
            if stock_submit:
                selected = equipment_df.loc[equipment_df["asset_code"] == stock_asset_code].iloc[0]
                ok, message = process_stock_action(selected, action, qty, operator, target_person, remark)
                if ok:
                    st.success(message)
                    st.rerun()
                else:
                    st.error(message)
        if not log_df.empty:
            st.dataframe(log_df, use_container_width=True, hide_index=True)

with tab4:
    st.subheader("手机扫码出入库")
    st.info(
        f"手机和电脑连到同一个局域网后，在手机浏览器打开 `http://{local_ip}:8501`，进入本页即可直接用手机摄像头扫码并提交到电脑数据库。"
    )
    st.markdown(
        "- 第一步：在“二维码管理”里给每个设备打印二维码。\n"
        "- 第二步：手机打开本系统网页。\n"
        "- 第三步：在下面选择操作类型，并用手机拍摄二维码完成识别。"
    )
    if equipment_df.empty:
        st.info("暂无设备，请先添加设备并生成二维码。")
    else:
        with st.form("mobile_scan_form"):
            m1, m2, m3 = st.columns(3)
            mobile_action = m1.selectbox("操作类型", ["出库", "入库"], key="mobile_action")
            mobile_qty = m2.number_input("数量", min_value=1, value=1, key="mobile_qty")
            mobile_operator = m3.text_input("经办人", key="mobile_operator")
            mobile_target = st.text_input("借用/归还人", key="mobile_target")
            mobile_remark = st.text_area("说明", key="mobile_remark")
            mobile_photo = st.camera_input("用手机摄像头拍摄设备二维码")
            manual_scan_code = st.text_input("识别失败时可手动输入设备编码", key="manual_scan_code")
            mobile_submit = st.form_submit_button("提交扫码登记")
            if mobile_submit:
                decoded_code = decode_qr_image(mobile_photo) if mobile_photo is not None else ""
                asset_code = parse_asset_code(decoded_code or manual_scan_code)
                if not asset_code:
                    st.error("没有识别到二维码内容，请重试或手动输入设备编码。")
                else:
                    matched = equipment_df.loc[equipment_df["asset_code"] == asset_code]
                    if matched.empty:
                        st.error(f"系统中不存在设备编码：{asset_code}")
                    else:
                        selected = matched.iloc[0]
                        ok, message = process_stock_action(selected, mobile_action, mobile_qty, mobile_operator, mobile_target, mobile_remark)
                        if ok:
                            st.success(f"扫码识别设备：{asset_code}。{message}")
                            st.rerun()
                        else:
                            st.error(message)

with tab5:
    st.subheader("二维码管理")
    if equipment_df.empty:
        st.info("暂无设备二维码可生成。")
    else:
        qr_code_asset = st.selectbox("选择需要生成二维码的设备", equipment_df["asset_code"].tolist(), key="qr")
        selected = equipment_df.loc[equipment_df["asset_code"] == qr_code_asset].iloc[0]
        qr_bytes = generate_qr_bytes(qr_code_asset)
        st.image(qr_bytes, caption=f"{selected['name']} / {qr_code_asset}", width=220)
        st.download_button(
            label="下载二维码 PNG",
            data=qr_bytes,
            file_name=f"{qr_code_asset}.png",
            mime="image/png",
        )
        payload = base64.b64encode(qr_bytes).decode("utf-8")
        st.markdown(
            f"<div style='padding:12px;border:1px dashed #999;border-radius:12px;'>"
            f"<strong>打印标签建议</strong><br>设备名称：{selected['name']}<br>"
            f"设备编码：{qr_code_asset}<br>"
            f"库位：{selected['location']}<br>"
            f"借用人：{selected['borrower'] or '暂无'}<br>"
            f"<img src='data:image/png;base64,{payload}' width='120'></div>",
            unsafe_allow_html=True,
        )

with tab6:
    st.subheader("Excel 批量导入")
    uploaded_file = st.file_uploader("上传设备台账 Excel 文件", type=["xlsx", "xls"])
    if uploaded_file is not None:
        imported, sheets = import_excel(uploaded_file)
        st.success(f"导入完成：共读取工作表 {', '.join(sheets)}，新增 {imported} 条设备记录。")
        st.rerun()

st.divider()
st.markdown(
    """
    ### UI 设计说明
    - 顶部是核心指标卡，方便快速看到设备总量、当前可用量和出入库记录。
    - 中部使用 **6 个标签页** 区分看板、台账维护、人工出入库、手机扫码、二维码和 Excel 导入。
    - 列表中已经增加 **借用人** 字段，能直接看出当前设备借给了谁。
    - 手机扫码页适合用手机浏览器直接访问系统，用摄像头拍二维码后把出入库数据回写到电脑上的 SQLite 数据库。
    """
)
