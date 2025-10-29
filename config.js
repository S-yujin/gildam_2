window.LLM_CONFIG = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  endpoint: (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
  useProxy: false, 
  proxyURL: "/api/generate",
  key: "APIkey",          // 필요 시 직접 키 넣을 수도 있음
  preTopK: 140,
  maxItemsPerDay: 4,
  responseMimeType: "application/json"
};


