// Common authentication logic
document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
    );

    // Check authentication status
    const updateAuthUI = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const authLink = document.querySelector('.auth-link');
        const intentionsLink = document.querySelector('.intentions-link');
        const logoutLink = document.querySelector('.logout-link');
        
        if (session) {
            authLink.classList.add('hidden');
            intentionsLink.classList.remove('hidden');
            logoutLink.classList.remove('hidden');
        } else {
            authLink.classList.remove('hidden');
            intentionsLink.classList.add('hidden');
            logoutLink.classList.add('hidden');
        }
    };

    // Initial check
    updateAuthUI();

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        updateAuthUI();
    });

    // Logout functionality
    document.querySelector('.logout-link')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            window.location.href = 'index.html';
        } catch (error) {
            alert(error.message);
        }
    });
}); 