document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const auditForm = document.getElementById('auditForm');
  const urlInput = document.getElementById('urlInput');
  const auditBtn = document.getElementById('auditBtn');
  const quickStartChips = document.querySelectorAll('.chip');
  
  const loadingWizard = document.getElementById('loadingWizard');
  const wizardSteps = document.querySelectorAll('.wizard-step');
  const errorBanner = document.getElementById('errorBanner');
  const dashboardResults = document.getElementById('dashboardResults');
  
  // Health dashboard elements
  const healthStatusDot = document.getElementById('healthStatusDot');
  const healthStatusText = document.getElementById('healthStatusText');
  const activeAuditsVal = document.getElementById('activeAuditsVal');
  const queuedAuditsVal = document.getElementById('queuedAuditsVal');
  const cacheHitRatioVal = document.getElementById('cacheHitRatioVal');
  
  // Results Elements
  const gaugeFill = document.getElementById('gaugeFill');
  const gaugePercent = document.getElementById('gaugePercent');
  const scoreSubtitle = document.getElementById('scoreSubtitle');
  
  const resUrl = document.getElementById('resUrl');
  const resFinalUrl = document.getElementById('resFinalUrl');
  const resStatusCode = document.getElementById('resStatusCode');
  const resResponseTime = document.getElementById('resResponseTime');
  const resResponseTimeUnit = document.getElementById('resResponseTimeUnit');
  const resResponseTimeMeter = document.getElementById('resResponseTimeMeter');
  const resResponseTimeLabel = document.getElementById('resResponseTimeLabel');
  
  const resHttpsBadge = document.getElementById('resHttpsBadge');
  const resCacheBadge = document.getElementById('resCacheBadge');
  const resContentType = document.getElementById('resContentType');
  const resContentSize = document.getElementById('resContentSize');
  
  // Security
  const secHstsStatus = document.getElementById('secHstsStatus');
  const secHstsDesc = document.getElementById('secHstsDesc');
  const secCspStatus = document.getElementById('secCspStatus');
  const secCspDesc = document.getElementById('secCspDesc');
  const secXfoStatus = document.getElementById('secXfoStatus');
  const secXfoDesc = document.getElementById('secXfoDesc');
  
  // SEO Basics
  const seoTitle = document.getElementById('seoTitle');
  const seoTitleLength = document.getElementById('seoTitleLength');
  const seoDesc = document.getElementById('seoDesc');
  const seoDescLength = document.getElementById('seoDescLength');
  
  // Structure & Media
  const seoH1Count = document.getElementById('seoH1Count');
  const seoH2Count = document.getElementById('seoH2Count');
  const seoWordCount = document.getElementById('seoWordCount');
  const seoLinkCount = document.getElementById('seoLinkCount');
  
  // Image ALT
  const imgAltCoverage = document.getElementById('imgAltCoverage');
  const imgAltCoverageBar = document.getElementById('imgAltCoverageBar');
  const imgAltStats = document.getElementById('imgAltStats');
  
  // Raw Data JSON
  const jsonViewCard = document.getElementById('jsonViewCard');
  const jsonViewHeader = document.getElementById('jsonViewHeader');
  const rawJsonCode = document.getElementById('rawJsonCode');
  
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Collapsible JSON View
  jsonViewHeader.addEventListener('click', () => {
    jsonViewCard.classList.toggle('expanded');
  });

  // Query Server Health
  async function fetchHealth() {
    try {
      const response = await fetch('/health');
      if (!response.ok) throw new Error('Health check response not OK');
      const data = await response.json();
      
      healthStatusDot.className = 'status-dot online';
      healthStatusText.textContent = 'Online';
      activeAuditsVal.textContent = data.activeAudits || 0;
      queuedAuditsVal.textContent = data.queuedAudits || 0;
      
      const hits = data.cache?.hits || 0;
      const misses = data.cache?.misses || 0;
      const total = hits + misses;
      const ratio = total > 0 ? Math.round((hits / total) * 100) : 0;
      cacheHitRatioVal.textContent = `${ratio}% (${hits}/${total})`;
    } catch (err) {
      healthStatusDot.className = 'status-dot offline';
      healthStatusText.textContent = 'Offline';
      activeAuditsVal.textContent = '-';
      queuedAuditsVal.textContent = '-';
      cacheHitRatioVal.textContent = '-';
    }
  }
  
  // Query health on load and every 10 seconds
  fetchHealth();
  setInterval(fetchHealth, 10000);
  
  // Click on Suggestion Chips
  quickStartChips.forEach(chip => {
    chip.addEventListener('click', () => {
      urlInput.value = chip.dataset.url;
      urlInput.focus();
    });
  });

  // Form Submit Action
  auditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let url = urlInput.value.trim();
    if (!url) return;
    
    // Add http:// prefix if missing
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
      urlInput.value = url;
    }
    
    // Reset UI state
    errorBanner.style.display = 'none';
    dashboardResults.style.display = 'none';
    loadingWizard.style.display = 'block';
    auditBtn.disabled = true;
    auditBtn.innerHTML = `<i data-lucide="loader" class="wizard-spinner"></i> Auditing...`;
    lucide.createIcons();
    
    // Start loader animation checks
    await triggerStep(0, 'Checking URL structure...');
    await triggerStep(1, 'Executing SSRF safety checks...');
    
    try {
      // Step 2: Request is fired
      updateStepUI(2, 'active', 'Sending audit request...');
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw {
          isApiError: true,
          code: data.error?.code || 'UNKNOWN_ERROR',
          message: data.error?.message || 'An unexpected error occurred.',
          requestId: data.error?.requestId || response.headers.get('X-Request-Id') || 'N/A'
        };
      }
      
      // Step 2 Completed
      await triggerStep(2, 'Response received!');
      
      // Step 3: Analysis
      await triggerStep(3, 'Analyzing headers & DOM content...');
      
      // Step 4: Formatting
      await triggerStep(4, 'Compiling audit report...');
      
      // Hide loader and show results
      setTimeout(() => {
        loadingWizard.style.display = 'none';
        renderResults(data);
        fetchHealth(); // refresh health status
        resetAuditButton();
      }, 500);
      
    } catch (err) {
      loadingWizard.style.display = 'none';
      resetAuditButton();
      showError(err);
    }
  });
  
  function resetAuditButton() {
    auditBtn.disabled = false;
    auditBtn.innerHTML = `Audit Page <i data-lucide="arrow-right"></i>`;
    lucide.createIcons();
  }
  
  // Animation delay simulator
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function triggerStep(index, statusText) {
    updateStepUI(index, 'active', statusText);
    await sleep(index === 1 ? 400 : 300); // give a brief natural delay
    updateStepUI(index, 'completed', 'Done');
  }
  
  function updateStepUI(index, state, text) {
    const step = wizardSteps[index];
    if (!step) return;
    
    step.className = `wizard-step ${state}`;
    const statusEl = step.querySelector('.step-status');
    if (statusEl) statusEl.textContent = text;
  }
  
  // Display Error Details
  function showError(err) {
    errorBanner.style.display = 'flex';
    const titleEl = errorBanner.querySelector('h4');
    const descEl = errorBanner.querySelector('p');
    const metaEl = errorBanner.querySelector('.error-meta');
    
    if (err.isApiError) {
      titleEl.textContent = `Audit Failed: ${err.code}`;
      descEl.textContent = err.message;
      metaEl.textContent = `Request ID: ${err.requestId}`;
      metaEl.style.display = 'block';
    } else {
      titleEl.textContent = 'Connection Error';
      descEl.textContent = err.message || 'Could not connect to the server. Make sure the Node application is running.';
      metaEl.style.display = 'none';
    }
    
    window.scrollTo({ top: errorBanner.offsetTop - 40, behavior: 'smooth' });
  }
  
  // Parse and display audit data
  function renderResults(data) {
    dashboardResults.style.display = 'block';
    
    // Basic Details
    resUrl.textContent = data.url;
    resUrl.href = data.url;
    resFinalUrl.textContent = data.finalUrl;
    resFinalUrl.href = data.finalUrl;
    resContentType.textContent = data.contentType || 'N/A';
    
    // Status Code Badge
    resStatusCode.textContent = data.statusCode;
    resStatusCode.className = 'badge';
    if (data.statusCode >= 200 && data.statusCode < 300) {
      resStatusCode.classList.add('badge-success');
    } else if (data.statusCode >= 300 && data.statusCode < 400) {
      resStatusCode.classList.add('badge-warning');
    } else {
      resStatusCode.classList.add('badge-error');
    }
    
    // Response Time
    resResponseTime.textContent = data.responseTimeMs;
    let speedWidth = Math.min((data.responseTimeMs / 3000) * 100, 100);
    resResponseTimeMeter.style.width = `${speedWidth}%`;
    
    if (data.responseTimeMs < 400) {
      resResponseTimeMeter.style.backgroundColor = 'var(--success)';
      resResponseTimeLabel.textContent = 'Excellent Response Time';
      resResponseTimeLabel.style.color = 'var(--success)';
    } else if (data.responseTimeMs < 1200) {
      resResponseTimeMeter.style.backgroundColor = 'var(--warning)';
      resResponseTimeLabel.textContent = 'Moderate Delay';
      resResponseTimeLabel.style.color = 'var(--warning)';
    } else {
      resResponseTimeMeter.style.backgroundColor = 'var(--error)';
      resResponseTimeLabel.textContent = 'Slow Target Response';
      resResponseTimeLabel.style.color = 'var(--error)';
    }
    
    // File Size
    if (data.contentLengthBytes !== null) {
      const kb = (data.contentLengthBytes / 1024).toFixed(1);
      resContentSize.textContent = `${kb} KB (${data.contentLengthBytes} bytes)`;
    } else {
      resContentSize.textContent = 'Unknown (no Content-Length header)';
    }
    
    // Https & Cache indicators
    resHttpsBadge.className = 'badge ' + (data.isHttps ? 'badge-success' : 'badge-error');
    resHttpsBadge.innerHTML = data.isHttps 
      ? '<i data-lucide="shield-check" style="width: 14px; height: 14px"></i> HTTPS Secure' 
      : '<i data-lucide="shield-alert" style="width: 14px; height: 14px"></i> Insecure HTTP';
      
    resCacheBadge.className = 'badge ' + (data.cache?.hit ? 'badge-success' : 'badge-info');
    resCacheBadge.innerHTML = data.cache?.hit 
      ? '<i data-lucide="database" style="width: 14px; height: 14px"></i> Cache Hit' 
      : '<i data-lucide="refresh-cw" style="width: 14px; height: 14px"></i> Live Fetch';
      
    // Security Checks
    updateSecurityItem(secHstsStatus, secHstsDesc, data.security.hasHsts, 
      'HSTS Active', 'Strict-Transport-Security header is set.', 
      'HSTS Missing', 'Strict-Transport-Security header is missing. Secure connections are not enforced.');
      
    updateSecurityItem(secCspStatus, secCspDesc, data.security.hasContentSecurityPolicy, 
      'CSP Enforced', 'Content-Security-Policy header is configured.', 
      'CSP Missing', 'Content-Security-Policy header is missing. Defenseless against XSS attacks.');
      
    updateSecurityItem(secXfoStatus, secXfoDesc, data.security.hasXFrameOptions, 
      'Clickjacking Guarded', 'X-Frame-Options or frame-ancestors is present.', 
      'Clickjacking Vulnerable', 'X-Frame-Options header is missing. Site can be framed inside iframe clickjacking scripts.');
      
    // DOM page metrics
    const pageBasicsSection = document.getElementById('pageBasicsSection');
    const imagesSection = document.getElementById('imagesSection');
    
    if (data.page) {
      pageBasicsSection.style.display = 'block';
      imagesSection.style.display = 'block';
      
      // Title
      if (data.page.title) {
        seoTitle.textContent = `"${data.page.title}"`;
        seoTitle.classList.remove('seo-metric-empty');
        const len = data.page.title.length;
        if (len >= 30 && len <= 60) {
          seoTitleLength.className = 'badge badge-success';
          seoTitleLength.textContent = `${len} chars (Optimal)`;
        } else {
          seoTitleLength.className = 'badge badge-warning';
          seoTitleLength.textContent = `${len} chars (Slightly sub-optimal: prefer 30-60)`;
        }
      } else {
        seoTitle.textContent = 'Missing Page Title';
        seoTitle.classList.add('seo-metric-empty');
        seoTitleLength.className = 'badge badge-error';
        seoTitleLength.textContent = 'No Title Tag found!';
      }
      
      // Meta Description
      if (data.page.metaDescription) {
        seoDesc.textContent = `"${data.page.metaDescription}"`;
        seoDesc.classList.remove('seo-metric-empty');
        const len = data.page.metaDescription.length;
        if (len >= 120 && len <= 160) {
          seoDescLength.className = 'badge badge-success';
          seoDescLength.textContent = `${len} chars (Optimal)`;
        } else {
          seoDescLength.className = 'badge badge-warning';
          seoDescLength.textContent = `${len} chars (Sub-optimal: prefer 120-160)`;
        }
      } else {
        seoDesc.textContent = 'Missing description meta tag.';
        seoDesc.classList.add('seo-metric-empty');
        seoDescLength.className = 'badge badge-error';
        seoDescLength.textContent = 'No Meta Description found!';
      }
      
      // Structure & counts
      seoH1Count.textContent = data.page.h1Count;
      seoH1Count.className = data.page.h1Count === 1 ? 'heading-tag-count text-success' : 'heading-tag-count text-warning';
      
      seoH2Count.textContent = data.page.h2Count;
      seoWordCount.textContent = data.page.wordCount;
      seoLinkCount.textContent = data.page.internalLinkCount;
      
      // Alt tag coverage
      const imgCount = data.page.imageCount || 0;
      const missingAlt = data.page.imagesMissingAlt || 0;
      const hasAlt = imgCount - missingAlt;
      
      if (imgCount > 0) {
        const altCoveragePercent = Math.round((hasAlt / imgCount) * 100);
        imgAltCoverage.textContent = `${altCoveragePercent}%`;
        imgAltCoverageBar.style.width = `${altCoveragePercent}%`;
        
        if (altCoveragePercent === 100) {
          imgAltCoverageBar.style.backgroundColor = 'var(--success)';
        } else if (altCoveragePercent > 70) {
          imgAltCoverageBar.style.backgroundColor = 'var(--warning)';
        } else {
          imgAltCoverageBar.style.backgroundColor = 'var(--error)';
        }
        imgAltStats.textContent = `${hasAlt} of ${imgCount} images have alt attributes (${missingAlt} missing alt)`;
      } else {
        imgAltCoverage.textContent = 'N/A';
        imgAltCoverageBar.style.width = '0%';
        imgAltCoverageBar.style.backgroundColor = 'var(--text-muted)';
        imgAltStats.textContent = 'No images detected on page.';
      }
      
    } else {
      // Non-HTML audits, hide DOM sections
      pageBasicsSection.style.display = 'none';
      imagesSection.style.display = 'none';
    }
    
    // Calculate Score
    const score = calculateScore(data);
    updateScoreGauge(score);
    
    // Raw JSON representation
    rawJsonCode.textContent = JSON.stringify(data, null, 2);
    
    // Reload Icons
    lucide.createIcons();
    
    // Scroll to dashboard results
    window.scrollTo({ top: dashboardResults.offsetTop - 20, behavior: 'smooth' });
  }
  
  function updateSecurityItem(statusEl, descEl, isPresent, passTitle, passDesc, failTitle, failDesc) {
    if (isPresent) {
      statusEl.className = 'security-item-status pass';
      statusEl.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px"></i>';
      descEl.previousElementSibling.textContent = passTitle;
      descEl.textContent = passDesc;
    } else {
      statusEl.className = 'security-item-status fail';
      statusEl.innerHTML = '<i data-lucide="x" style="width: 16px; height: 16px"></i>';
      descEl.previousElementSibling.textContent = failTitle;
      descEl.textContent = failDesc;
    }
  }
  
  function calculateScore(data) {
    let score = 100;
    
    // Basic connectivity
    if (!data.ok) score -= 15;
    
    // HTTPS Secure check
    if (!data.isHttps) {
      score -= 15;
    }
    
    // Security headers checks
    if (!data.security.hasHsts) score -= 15;
    if (!data.security.hasContentSecurityPolicy) score -= 15;
    if (!data.security.hasXFrameOptions) score -= 10;
    
    // Performance latency check
    if (data.responseTimeMs > 2000) {
      score -= 15;
    } else if (data.responseTimeMs > 800) {
      score -= 10;
    } else if (data.responseTimeMs > 400) {
      score -= 5;
    }
    
    // DOM SEO analysis deductions (if HTML response)
    if (data.page) {
      // missing tags check
      if (!data.page.title) score -= 10;
      if (!data.page.metaDescription) score -= 10;
      
      // title checks
      if (data.page.title) {
        const titleLen = data.page.title.length;
        if (titleLen < 30 || titleLen > 60) score -= 5;
      }
      
      // meta descriptions checks
      if (data.page.metaDescription) {
        const descLen = data.page.metaDescription.length;
        if (descLen < 120 || descLen > 160) score -= 5;
      }
      
      // Heading elements checks
      if (data.page.h1Count !== 1) score -= 5;
      
      // Image alt check
      if (data.page.imageCount > 0) {
        const coverageRatio = (data.page.imageCount - data.page.imagesMissingAlt) / data.page.imageCount;
        if (coverageRatio < 1) {
          score -= Math.round((1 - coverageRatio) * 10);
        }
      }
    } else {
      // Non-HTML target adjustments
      // Since SEO doesn't apply to JSON APIs, we adjust the penalty weight
      // to let robust secure API endpoints achieve close to 100 score.
      // If it is non-HTML, the remaining metrics are: Https, Hsts, CSP, Xfo, Response Time.
      // Maximum deductions so far are 15 + 15 + 15 + 15 + 10 = 70.
      // We will normalize the score of the remaining 5 security parameters to a scale of 100.
      let apiScore = 100;
      if (!data.isHttps) apiScore -= 30;
      if (!data.security.hasHsts) apiScore -= 25;
      if (!data.security.hasContentSecurityPolicy) apiScore -= 25;
      if (!data.security.hasXFrameOptions) apiScore -= 20;
      
      // limit speed deduction weight
      if (data.responseTimeMs > 2000) apiScore -= 15;
      else if (data.responseTimeMs > 800) apiScore -= 10;
      
      score = apiScore;
    }
    
    return Math.max(0, score);
  }
  
  function updateScoreGauge(score) {
    gaugePercent.textContent = `${score}%`;
    
    // Stroke dashoffset: circumference of circle is 2 * pi * r.
    // Circle r = 64. Circumference = 2 * 3.14159 * 64 = 402.12 (rounded to 402)
    const offset = 402 - (402 * score) / 100;
    gaugeFill.style.strokeDashoffset = offset;
    
    let colorClass = '';
    let gradeLabel = '';
    if (score >= 90) {
      gradeLabel = 'Grade A — Highly Secure & Audited';
      scoreSubtitle.style.color = 'var(--success)';
    } else if (score >= 70) {
      gradeLabel = 'Grade B — Moderate Security/SEO';
      scoreSubtitle.style.color = 'var(--warning)';
    } else if (score >= 50) {
      gradeLabel = 'Grade C — Poor compliance checks';
      scoreSubtitle.style.color = 'var(--warning)';
    } else {
      gradeLabel = 'Grade F — Critical Security/SEO issues';
      scoreSubtitle.style.color = 'var(--error)';
    }
    scoreSubtitle.textContent = gradeLabel;
  }
});
