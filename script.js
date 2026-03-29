// ===== SMOOTH SCROLL =====

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
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
    '.card, .timeline-item, .methodology-card, .perspective-card, .mvp-card, .conclusion-card, .role-separation-card'
).forEach(item => {
    observer.observe(item);
});

// ===== NAVBAR SHRINK ON SCROLL =====

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar-custom');
    if (window.scrollY > 100) {
        navbar.style.boxShadow = '0 8px 30px rgba(30, 60, 114, 0.25)';
    } else {
        navbar.style.boxShadow = '0 4px 20px rgba(30, 60, 114, 0.15)';
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