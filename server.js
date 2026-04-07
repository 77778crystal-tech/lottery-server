const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const {
  APP_ID,
  APP_SECRET,
  APP_TOKEN,
  TABLE_POINTS,
  TABLE_DRAW_RECORD,
  PORT = 10000
} = process.env;

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

let tokenCache = {
  value: "",
  expireAt: 0
};

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expireAt > now + 60 * 1000) {
    return tokenCache.value;
  }

  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: APP_ID,
      app_secret: APP_SECRET
    })
  });

  const data = await res.json();

  if (!res.ok || data.code !== 0) {
    throw new Error(data.msg || "获取 tenant_access_token 失败");
  }

  tokenCache.value = data.tenant_access_token;
  tokenCache.expireAt = Date.now() + (data.expire - 60) * 1000;
  return tokenCache.value;
}

async function feishuRequest(path, options = {}) {
  const token = await getTenantAccessToken();

  const res = await fetch(`${FEISHU_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await res.json();

  if (!res.ok || data.code !== 0) {
    throw new Error(data.msg || "飞书接口调用失败");
  }

  return data;
}

async function searchRecords(tableId, filter) {
  const data = await feishuRequest(
    `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/search`,
    {
      method: "POST",
      body: JSON.stringify({
        filter,
        page_size: 100
      })
    }
  );

  return data.data.items || [];
}

async function updateRecord(tableId, recordId, fields) {
  return feishuRequest(
    `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/${recordId}`,
    {
      method: "PUT",
      body: JSON.stringify({ fields })
    }
  );
}

async function createRecord(tableId, fields) {
  return feishuRequest(
    `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records`,
    {
      method: "POST",
      body: JSON.stringify({ fields })
    }
  );
}

app.get("/", (req, res) => {
  res.send("后端启动成功");
});

app.post("/api/check-and-deduct", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "缺少邮箱"
      });
    }

    const items = await searchRecords(TABLE_POINTS, {
      conjunction: "and",
      conditions: [
        {
          field_name: "邮箱",
          operator: "is",
          value: [email]
        }
      ]
    });

    if (!items.length) {
      return res.status(404).json({
        success: false,
        message: "积分表里找不到这个邮箱"
      });
    }

    const record = items[0];
    const fields = record.fields || {};
    const currentPoints = Number(fields["当前积分"] || 0);

    if (currentPoints < 300) {
      return res.status(400).json({
        success: false,
        message: `积分不足，当前仅剩 ${currentPoints} 积分`
      });
    }

    const newPoints = currentPoints - 300;

    await updateRecord(TABLE_POINTS, record.record_id, {
      当前积分: newPoints
    });

    await createRecord(TABLE_DRAW_RECORD, {
      邮箱: email,
      用户标识: email,
      抽奖结果: "待抽奖",
      是否中奖: "待定",
      消耗积分: 300,
      抽奖时间: new Date().toLocaleString("zh-CN", { hour12: false })
    });

    return res.json({
      success: true,
      message: "可以抽奖，已扣除300积分",
      remainPoints: newPoints
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "校验失败"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`server running on port ${PORT}`);
});
