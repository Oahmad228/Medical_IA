// ===== SMOOTH SCROLL =====

document.querySelectorAll('a.nav-link, .hero-buttons a').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (!targetId || !targetId.startsWith('#')) {
            return;
        }

        e.preventDefault();
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 70,
                behavior: 'smooth'
            });
        }
    });
});

// ===== INTERSECTION OBSERVER ANIMATIONS =====

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            entry.target.style.animationDelay = `${index * 0.1}s`;
            entry.target.classList.add('animate-on-scroll');
        }
    });
}, observerOptions);

// Observe all animatable elements
document.querySelectorAll(
    '.card, .timeline-item, .methodology-card, .perspective-card, .mvp-card, .conclusion-card, .role-separation-card, .callout'
).forEach(item => {
    observer.observe(item);
});

// ===== NAVBAR ON SCROLL =====

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar-custom');
    if (!navbar) {
        return;
    }

    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(7, 19, 28, 0.95)';
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
    } else {
        navbar.style.background = 'rgba(7, 19, 28, 0.85)';
        navbar.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)';
    }
});

// ===== COUNTER ANIMATION =====

function animateCounter(element, target, duration = 2000) {
    let current = 0;
    const increment = target / (duration / 50);
    
    const updateCounter = () => {
        current += increment;
        if (current < target) {
            element.textContent = Math.ceil(current) + '%';
            setTimeout(updateCounter, 50);
        } else {
            element.textContent = target + '%';
        }
    };
    
    updateCounter();
}

// ===== ADD SCROLL ANIMATIONS ON LOAD =====

document.addEventListener('DOMContentLoaded', () => {
    // Add fade-in to hero section
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.animation = 'fadeIn 1s ease';
    }
});
