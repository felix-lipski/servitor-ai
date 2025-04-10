document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('manifestation-form');
    const submitButton = form.querySelector('button[type="submit"]');

    // Add cost display element before the submit button
    const costDisplay = document.createElement('div');
    costDisplay.id = 'cost-display';
    submitButton.parentNode.insertBefore(costDisplay, submitButton);

    // Add login warning for non-logged in users
    const loginWarning = document.createElement('div');
    loginWarning.id = 'login-warning';
    loginWarning.className = 'login-warning';
    loginWarning.innerHTML = 'You\'re not logged in! You will not be able to edit or delete the intention once it\'s created! <a href="auth.html">Login here</a>';
    submitButton.parentNode.insertBefore(loginWarning, submitButton);

    // Add word count display after intensity select
    const intensitySelect = document.getElementById('intensity');
    const wordCountDisplay = document.createElement('div');
    wordCountDisplay.id = 'word-count-display';
    wordCountDisplay.className = 'word-count-display';
    intensitySelect.parentNode.insertBefore(wordCountDisplay, intensitySelect.nextSibling);

    // Calculate price based on duration (same as backend)
    function calculatePrice(duration, intensity) {
        const pricePerDay = 0.1; // $0.10 per day
        return duration * pricePerDay * Number(intensity);
    }

    // Update word count display based on intensity
    function updateWordCountDisplay() {
        const intensity = intensitySelect.value;
        let wordCount = '';
        
        switch(intensity) {
            case '1':
                wordCount = '~25,000 words/day';
                break;
            case '2':
                wordCount = '~50,000 words/day';
                break;
            case '3':
                wordCount = '~100,000 words/day';
                break;
            default:
                wordCount = '';
        }
        
        wordCountDisplay.textContent = wordCount;
    }

    // Update cost display whenever duration or intensity changes
    const durationSelect = document.getElementById('duration');
    
    function updateCostDisplay() {
        const duration = parseInt(durationSelect.value);
        const intensity = intensitySelect.value;
        const cost = calculatePrice(duration, intensity);
        
        // Calculate total words based on intensity and duration
        const wordsPerDay = intensity === '1' ? 25000 : intensity === '2' ? 50000 : 100000;
        const totalWords = Math.round(duration * wordsPerDay);
        const books = Math.round(totalWords / 100000);
        
        costDisplay.innerHTML = `<span style="float: left">Total: ~${totalWords.toLocaleString()} words (~${books} books 📚)</span><span style="float: right">Cost: <span class="cost-value">$${cost.toFixed(2)}</span></span>`;
    }
    
    durationSelect.addEventListener('change', updateCostDisplay);
    intensitySelect.addEventListener('change', () => {
        updateCostDisplay();
        updateWordCountDisplay();
    });
    
    // Initial displays
    updateCostDisplay();
    updateWordCountDisplay();

    // Check if user is logged in and hide warning if they are
    const checkLoginStatus = async () => {
        const supabase = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            loginWarning.style.display = 'none';
        } else {
            loginWarning.style.display = 'block';
        }
    };
    
    // Check login status on page load
    checkLoginStatus();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        console.log('submit button clicked');

        // Get form values
        const intention = document.getElementById('intention').value;
        const duration = document.getElementById('duration').value;
        const intensity = document.getElementById('intensity').value;

        const originalButtonText = submitButton.textContent;
        
        try {
            // Show loading state
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;

            // Initialize Supabase client
            const supabase = window.supabase.createClient(
                window.SUPABASE_URL,
                window.SUPABASE_ANON_KEY
            );

            // Call the payment function
            const { data, error } = await supabase.functions.invoke('payment', {
                body: {
                    intention,
                    duration,
                    intensity
                }
            });

            if (error) {
                throw error;
            }

            // Redirect to Stripe checkout
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL received');
            }

        } catch (error) {
            console.error('Payment error:', error);
            alert('There was an error processing your request. Please try again.');
        } finally {
            // Reset button state
            submitButton.textContent = originalButtonText;
            submitButton.disabled = false;
        }
    });
}); 