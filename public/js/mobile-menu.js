/**
 * Mobil menyu — hamburger tugmasi va sidebar overlay.
 * Kichik ekranda sidebar yopiladi, tugma orqali ochiladi.
 */
(function () {
    'use strict';

    function init() {
        var btn = document.getElementById('mobileMenuToggle');
        var overlay = document.getElementById('sidebarOverlay');
        var sidebar = document.querySelector('.sidebar');

        if (!btn || !overlay || !sidebar) return;

        function closeSidebar() {
            document.body.classList.remove('sidebar-open');
        }

        function isMobile() {
            return window.matchMedia('(max-width: 991px)').matches;
        }

        btn.addEventListener('click', function () {
            document.body.classList.toggle('sidebar-open');
        });

        overlay.addEventListener('click', closeSidebar);

        sidebar.addEventListener('click', function (e) {
            var link = e.target.closest('.sidebar-menu-link');
            if (link && isMobile()) closeSidebar();
        });

        window.addEventListener('resize', function () {
            if (!isMobile()) closeSidebar();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
