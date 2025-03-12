const app = require("./app");

const PORT = process.env.PORT || 8010;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});