// Nested accordion headers stick directly below their parent header: pass the parent header's real height
// (it can wrap to several lines) to the nested headers via --parent-accordion-header-height
const parentHeaderObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const header = entry.target;
        header.parentElement.style.setProperty("--parent-accordion-header-height", `${header.offsetHeight}px`);
    }
});

document.querySelectorAll(".accordion-item > .accordion-header").forEach((header) => {
    const isTopLevel = !header.closest(".accordion-body");
    const hasNestedAccordion = header.parentElement.querySelector(".accordion-body .accordion");
    if (isTopLevel && hasNestedAccordion) parentHeaderObserver.observe(header);
});

// When a stuck accordion header is collapsed, keep it in place instead of leaving the view somewhere further down the page
document.addEventListener("hide.bs.collapse", (event) => {
    if (!event.target.classList.contains("accordion-collapse")) return;

    const item = event.target.closest(".accordion-item");
    const stickyTop = parseFloat(getComputedStyle(item).scrollMarginTop);

    if (item.getBoundingClientRect().top < stickyTop) {
        item.scrollIntoView({ block: "start", behavior: "instant" });
    }
});
