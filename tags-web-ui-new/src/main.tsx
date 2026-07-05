
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

document.documentElement.dataset.mode = "dark";
document.body.dataset.mode = "dark";

createRoot(document.getElementById("root")!).render(<App />);
