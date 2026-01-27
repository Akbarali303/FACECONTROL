// Global Header Component
// This ensures consistent header across all pages

const PAGE_CONFIG = {
    '/': { title: 'Asosiy Dashboard', breadcrumb: 'Admin / Asosiy Dashboard' },
    '/index.html': { title: 'Asosiy Dashboard', breadcrumb: 'Admin / Asosiy Dashboard' },
    '/tashkilotlar.html': { title: 'Tashkilotlar', breadcrumb: 'Admin / Tashkilotlar' },
    '/bolimlar.html': { title: 'Bo\'limlar', breadcrumb: 'Admin / Bo\'limlar' },
    '/lavozimlar.html': { title: 'Lavozimlar', breadcrumb: 'Admin / Lavozimlar' },
    '/xodimlar.html': { title: 'Xodimlar', breadcrumb: 'Admin / Xodimlar' },
    '/vaqt-sozlamalari.html': { title: 'Vaqt sozlamalari', breadcrumb: 'Admin / Vaqt sozlamalari' },
    '/sozlamalar.html': { title: 'Sozlamalar', breadcrumb: 'Admin / Sozlamalar' },
    '/admin-qoshish.html': { title: 'Admin qo\'shish', breadcrumb: 'Admin / Admin qo\'shish' }
};

function updatePageHeader() {
    const currentPath = window.location.pathname;
    const config = PAGE_CONFIG[currentPath] || PAGE_CONFIG['/'];
    
    const pageTitle = document.getElementById('pageTitle');
    const pageBreadcrumb = document.getElementById('pageBreadcrumb');
    
    if (pageTitle) {
        pageTitle.textContent = config.title;
    }
    if (pageBreadcrumb) {
        pageBreadcrumb.textContent = config.breadcrumb;
    }
}

// Initialize header on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updatePageHeader);
} else {
    updatePageHeader();
}
