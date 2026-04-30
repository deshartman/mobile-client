const USER_GUID_KEY = 'userGUID';
const USER_NAME_KEY = 'userName';
const USER_PHONE_KEY = 'userPhone';

const state = {
    phone: null,
    isExistingUser: false
};

function $(id) { return document.getElementById(id); }

function show(stepId) {
    for (const el of document.querySelectorAll('.signup-step')) {
        el.style.display = 'none';
    }
    $(stepId).style.display = 'block';
}

function showError(message) {
    const el = $('signup-error');
    el.textContent = message;
    el.style.display = 'block';
}

function clearError() {
    $('signup-error').style.display = 'none';
}

function setLoading(isLoading, text = 'Loading...') {
    $('signup-loading').style.display = isLoading ? 'flex' : 'none';
    $('signup-loading-text').textContent = text;
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

async function handleSendOtp() {
    clearError();
    const phone = $('phone').value.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        showError('Enter a phone number in E.164 format (e.g. +15551234567)');
        return;
    }

    const btn = $('signup-send-otp');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const { isExistingUser } = await postJson('/auth/send-otp', { phone });
        state.phone = phone;
        state.isExistingUser = isExistingUser;
        $('signup-code-phone').textContent = phone;
        show('signup-step-code');
        $('code').focus();
    } catch (err) {
        showError(err.message || 'Could not send code. Try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send code';
    }
}

async function handleVerifyOtp() {
    clearError();
    const code = $('code').value.trim();
    if (!/^\d{6}$/.test(code)) {
        showError('Enter the 6-digit code');
        return;
    }

    const btn = $('signup-verify-otp');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    try {
        const { isExistingUser } = await postJson('/auth/verify-otp', { phone: state.phone, code });
        state.isExistingUser = isExistingUser;
        if (isExistingUser) {
            // Signin path — complete immediately, no name prompt.
            setLoading(true, 'Signing you in...');
            const { userGUID } = await postJson('/auth/complete', { phone: state.phone });
            finishAuth({ userGUID, name: null, phone: state.phone });
        } else {
            show('signup-step-name');
            $('name').focus();
        }
    } catch (err) {
        setLoading(false);
        showError(err.message || 'Verification failed.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify';
    }
}

async function handleComplete() {
    clearError();
    const name = $('name').value.trim();
    if (!name) {
        showError('Please enter your name');
        return;
    }

    const btn = $('signup-complete');
    btn.disabled = true;
    btn.textContent = 'Finishing...';
    try {
        const { userGUID } = await postJson('/auth/complete', { phone: state.phone, name });
        finishAuth({ userGUID, name, phone: state.phone });
    } catch (err) {
        showError(err.message || 'Could not complete signup.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Continue';
    }
}

async function handleResend() {
    clearError();
    if (!state.phone) return;
    const btn = $('signup-resend');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        await postJson('/auth/send-otp', { phone: state.phone });
    } catch (err) {
        showError(err.message || 'Could not resend code.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Resend code';
    }
}

function finishAuth({ userGUID, name, phone }) {
    sessionStorage.setItem(USER_GUID_KEY, userGUID);
    sessionStorage.setItem(USER_PHONE_KEY, phone);
    if (name) sessionStorage.setItem(USER_NAME_KEY, name);
    window.location.href = '/';
}

function initializeSignupView() {
    show('signup-step-phone');
    $('phone').focus();

    $('signup-send-otp').addEventListener('click', handleSendOtp);
    $('signup-verify-otp').addEventListener('click', handleVerifyOtp);
    $('signup-complete').addEventListener('click', handleComplete);
    $('signup-resend').addEventListener('click', handleResend);

    // Enter-to-submit per step
    $('phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSendOtp(); });
    $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleVerifyOtp(); });
    $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleComplete(); });
}

initializeSignupView();
