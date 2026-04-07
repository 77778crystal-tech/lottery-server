{\rtf1\ansi\ansicpg936\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww15100\viewh10400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 const express = require("express");\
const cors = require("cors");\
const dotenv = require("dotenv");\
\
dotenv.config();\
\
const app = express();\
app.use(cors());\
app.use(express.json());\
\
const \{\
  APP_ID,\
  APP_SECRET,\
  APP_TOKEN,\
  TABLE_POINTS,\
  TABLE_DRAW_RECORD,\
  PORT = 10000\
\} = process.env;\
\
const FEISHU_BASE = "https://open.feishu.cn/open-apis";\
\
let tokenCache = \{\
  value: "",\
  expireAt: 0\
\};\
\
async function getTenantAccessToken() \{\
  const now = Date.now();\
  if (tokenCache.value && tokenCache.expireAt > now + 60 * 1000) \{\
    return tokenCache.value;\
  \}\
\
  const res = await fetch(`$\{FEISHU_BASE\}/auth/v3/tenant_access_token/internal`, \{\
    method: "POST",\
    headers: \{\
      "Content-Type": "application/json"\
    \},\
    body: JSON.stringify(\{\
      app_id: APP_ID,\
      app_secret: APP_SECRET\
    \})\
  \});\
\
  const data = await res.json();\
\
  if (!res.ok || data.code !== 0) \{\
    throw new Error(data.msg || "\uc0\u33719 \u21462  tenant_access_token \u22833 \u36133 ");\
  \}\
\
  tokenCache.value = data.tenant_access_token;\
  tokenCache.expireAt = Date.now() + (data.expire - 60) * 1000;\
  return tokenCache.value;\
\}\
\
async function feishuRequest(path, options = \{\}) \{\
  const token = await getTenantAccessToken();\
\
  const res = await fetch(`$\{FEISHU_BASE\}$\{path\}`, \{\
    ...options,\
    headers: \{\
      Authorization: `Bearer $\{token\}`,\
      "Content-Type": "application/json",\
      ...(options.headers || \{\})\
    \}\
  \});\
\
  const data = await res.json();\
\
  if (!res.ok || data.code !== 0) \{\
    throw new Error(data.msg || "\uc0\u39134 \u20070 \u25509 \u21475 \u35843 \u29992 \u22833 \u36133 ");\
  \}\
\
  return data;\
\}\
\
async function searchRecords(tableId, filter) \{\
  const data = await feishuRequest(\
    `/bitable/v1/apps/$\{APP_TOKEN\}/tables/$\{tableId\}/records/search`,\
    \{\
      method: "POST",\
      body: JSON.stringify(\{\
        filter,\
        page_size: 100\
      \})\
    \}\
  );\
\
  return data.data.items || [];\
\}\
\
async function updateRecord(tableId, recordId, fields) \{\
  return feishuRequest(\
    `/bitable/v1/apps/$\{APP_TOKEN\}/tables/$\{tableId\}/records/$\{recordId\}`,\
    \{\
      method: "PUT",\
      body: JSON.stringify(\{ fields \})\
    \}\
  );\
\}\
\
async function createRecord(tableId, fields) \{\
  return feishuRequest(\
    `/bitable/v1/apps/$\{APP_TOKEN\}/tables/$\{tableId\}/records`,\
    \{\
      method: "POST",\
      body: JSON.stringify(\{ fields \})\
    \}\
  );\
\}\
\
app.get("/", (req, res) => \{\
  res.send("\uc0\u21518 \u31471 \u21551 \u21160 \u25104 \u21151 ");\
\});\
\
app.post("/api/check-and-deduct", async (req, res) => \{\
  try \{\
    const \{ email \} = req.body;\
\
    if (!email) \{\
      return res.status(400).json(\{\
        success: false,\
        message: "\uc0\u32570 \u23569 \u37038 \u31665 "\
      \});\
    \}\
\
    const items = await searchRecords(TABLE_POINTS, \{\
      conjunction: "and",\
      conditions: [\
        \{\
          field_name: "\uc0\u37038 \u31665 ",\
          operator: "is",\
          value: [email]\
        \}\
      ]\
    \});\
\
    if (!items.length) \{\
      return res.status(404).json(\{\
        success: false,\
        message: "\uc0\u31215 \u20998 \u34920 \u37324 \u25214 \u19981 \u21040 \u36825 \u20010 \u37038 \u31665 "\
      \});\
    \}\
\
    const record = items[0];\
    const fields = record.fields || \{\};\
    const currentPoints = Number(fields["\uc0\u24403 \u21069 \u31215 \u20998 "] || 0);\
\
    if (currentPoints < 300) \{\
      return res.status(400).json(\{\
        success: false,\
        message: `\uc0\u31215 \u20998 \u19981 \u36275 \u65292 \u24403 \u21069 \u20165 \u21097  $\{currentPoints\} \u31215 \u20998 `\
      \});\
    \}\
\
    const newPoints = currentPoints - 300;\
\
    await updateRecord(TABLE_POINTS, record.record_id, \{\
      \uc0\u24403 \u21069 \u31215 \u20998 : newPoints\
    \});\
\
    await createRecord(TABLE_DRAW_RECORD, \{\
      \uc0\u37038 \u31665 : email,\
      \uc0\u29992 \u25143 \u26631 \u35782 : email,\
      \uc0\u25277 \u22870 \u32467 \u26524 : "\u24453 \u25277 \u22870 ",\
      \uc0\u26159 \u21542 \u20013 \u22870 : "\u24453 \u23450 ",\
      \uc0\u28040 \u32791 \u31215 \u20998 : 300,\
      \uc0\u25277 \u22870 \u26102 \u38388 : new Date().toLocaleString("zh-CN", \{ hour12: false \})\
    \});\
\
    return res.json(\{\
      success: true,\
      message: "\uc0\u21487 \u20197 \u25277 \u22870 \u65292 \u24050 \u25187 \u38500 300\u31215 \u20998 ",\
      remainPoints: newPoints\
    \});\
  \} catch (err) \{\
    return res.status(500).json(\{\
      success: false,\
      message: err.message || "\uc0\u26657 \u39564 \u22833 \u36133 "\
    \});\
  \}\
\});\
\
app.listen(PORT, "0.0.0.0", () => \{\
  console.log(`server running on port $\{PORT\}`);\
\});}