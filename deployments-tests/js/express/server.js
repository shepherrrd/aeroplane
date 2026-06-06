const express = require("express");

const app = express();
const port = process.env.PORT || 8080;

app.get("/", (_request, response) => {
  response.type("text/plain").send("hello from js express\n");
});

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    framework: "express",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`js express listening on :${port}`);
});
