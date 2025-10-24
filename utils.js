// utils.js — פונקציות עזר גלובליות

// ניווט בין מסכים (views)
window.goTo = function (targetElOrId) {
  const target =
    typeof targetElOrId === "string"
      ? document.getElementById(targetElOrId)
      : targetElOrId;

  if (!target) {
    console.warn("goTo: view not found", targetElOrId);
    return;
  }
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  target.classList.add("active");
};
