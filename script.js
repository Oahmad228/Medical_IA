// Mobile Menu Toggle
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    const mobileLinks = mobileMenu.querySelectorAll('a');
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
        });
    });
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === "#") return;
        
        e.preventDefault();
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80, // Navbar height adjustment
                behavior: 'smooth'
            });
        }
    });
});

// Modal Logic
const modal = document.getElementById('member-modal');
const modalContent = document.getElementById('modal-content');
const modalName = document.getElementById('modal-name');
const modalRole = document.getElementById('modal-role');
const modalTasks = document.getElementById('modal-tasks');
const teamCards = document.querySelectorAll('.team-card');
const closeButtons = [document.getElementById('close-modal'), document.getElementById('close-modal-btn')];

const openModal = (card) => {
    const name = card.getAttribute('data-name');
    const role = card.getAttribute('data-role');
    const tasks = card.getAttribute('data-tasks').split(';');

    modalName.textContent = name;
    modalRole.textContent = role;
    modalTasks.innerHTML = '';
    
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'flex items-start p-3 bg-gray-50 rounded-xl border border-gray-100 transition-all hover:border-[#5E5ADB]/30';
        li.innerHTML = `
            <span class="text-[#5E5ADB] mr-3 mt-1"><i class="fas fa-check-circle"></i></span>
            <span class="text-gray-700 text-sm font-medium">${task}</span>
        `;
        modalTasks.appendChild(li);
    });

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
};

const closeModal = () => {
    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
};

teamCards.forEach(card => {
    card.addEventListener('click', () => openModal(card));
});

closeButtons.forEach(btn => {
    if (btn) btn.addEventListener('click', closeModal);
});

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Reveal animations on scroll
const revealElements = document.querySelectorAll('#team .workspace-card, #timeline .workspace-card, .section-header');
const revealOnScroll = () => {
    const triggerBottom = window.innerHeight / 5 * 4.5;
    revealElements.forEach(el => {
        const elTop = el.getBoundingClientRect().top;
        if (elTop < triggerBottom) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }
    });
};

revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
});

window.addEventListener('scroll', revealOnScroll);
revealOnScroll();
