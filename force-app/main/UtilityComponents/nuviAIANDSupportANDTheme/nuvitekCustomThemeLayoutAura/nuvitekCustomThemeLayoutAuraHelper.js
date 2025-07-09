({
    initializeComponent: function(component, helper) {
        console.log('🚀 Initializing Nuvitek Custom Theme Layout component...');
        
        // Initial debug check
        console.log('📊 Initial Hero Section Configuration:');
        console.log('  showHeroSection:', component.get('v.showHeroSection'));
        console.log('  heroTitle:', component.get('v.heroTitle'));
        console.log('  heroLayout:', component.get('v.heroLayout'));
        console.log('  heroBackgroundImage:', component.get('v.heroBackgroundImage'));
        
        // Initialize variables
        component.set('v.fabMenuOpen', false);
        component.set('v.llmAssistantOpen', false);
        component.set('v.helpFormOpen', false);
        component.set('v.scrolled', false);
        component.set('v.mobileMenuOpen', false);
        
        // Initialize footer column data if needed
        this.initColumnMenusData(component);
        
        // Process social links
        this.processSocialLinks(component);
        
        // Make debug functions globally available
        window.debugHeroSection = function() {
            helper.debugHeroSection(component);
        };
        
        window.debugHeroDOM = function() {
            helper.debugHeroDOM(component);
        };
        
        // Inject SVG icons after a short delay to ensure DOM is ready
        setTimeout(function() {
            helper.injectSvgIcons(component);
        }, 100);
        
        console.log('✅ Component initialized successfully.');
        console.log('💡 Debug commands available:');
        console.log('   debugHeroSection() - Complete hero section analysis');
        console.log('   debugHeroDOM() - Detailed DOM inspection');
    },
    
    setupScrollListener: function(component) {
        var self = this;
        
        // Define scroll handler
        var handleScroll = function() {
            if (window.scrollY > 20) {
                component.set('v.scrolled', true);
            } else {
                component.set('v.scrolled', false);
            }
            self.updateComputedProperties(component);
        };
        
        // Add scroll listener
        window.addEventListener('scroll', handleScroll);
        
        // Store reference for cleanup (if needed)
        component.set('v.scrollHandler', handleScroll);
    },
    
    loadNavigationData: function(component) {
        var headerMenuName = component.get('v.headerNavigationMenuName');
        var footerMenuName = component.get('v.footerNavigationMenuName');
        
        // Load header navigation
        if (headerMenuName) {
            this.getNavigationItems(component, headerMenuName, 'header');
        } else {
            component.set('v.isHeaderNavLoaded', true);
        }
        
        // Load footer navigation
        if (footerMenuName) {
            this.getNavigationItems(component, footerMenuName, 'footer');
        } else {
            component.set('v.isFooterNavLoaded', true);
        }
    },
    
    getNavigationItems: function(component, menuName, type) {
        var action = component.get('c.getNavigationItems');
        action.setParams({
            menuName: menuName
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === 'SUCCESS') {
                var data = response.getReturnValue();
                var processedItems = this.processNavItems(component, data, type === 'header');
                
                if (type === 'header') {
                    component.set('v.headerNavItems', processedItems);
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.footerNavItems', processedItems);
                    component.set('v.isFooterNavLoaded', true);
                    this.processFooterColumns(component);
                }
                
                this.updateComputedProperties(component);
            } else {
                console.error('Error loading navigation items:', response.getError());
                if (type === 'header') {
                    component.set('v.headerNavItems', []);
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.footerNavItems', []);
                    component.set('v.isFooterNavLoaded', true);
                }
            }
        });
        
        $A.enqueueAction(action);
    },
    
    processNavItems: function(component, navItems, isHeader) {
        if (!navItems || !navItems.menuItems) {
            return [];
        }
        
        var currentUrl = window.location.pathname;
        var hasHomeItem = false;
        var uniqueLabels = new Set();
        var uniqueUrls = new Set();
        
        var processedItems = [];
        
        navItems.menuItems.forEach(function(item) {
            var itemLabel = item.label ? item.label.toLowerCase() : '';
            var itemUrl = item.actionValue;
            
            // Skip duplicates
            if (uniqueLabels.has(itemLabel) || uniqueUrls.has(itemUrl)) {
                return;
            }
            
            // For footer, skip Home items
            if (!isHeader && (
                itemLabel === 'home' ||
                itemUrl === '/' ||
                (itemUrl && itemUrl.endsWith('/home'))
            )) {
                return;
            }
            
            // Add to tracking sets
            if (itemLabel) uniqueLabels.add(itemLabel);
            if (itemUrl) uniqueUrls.add(itemUrl);
            
            // Check if this is a home item
            if (itemLabel === 'home' ||
                itemUrl === '/' ||
                (itemUrl && itemUrl.endsWith('/home'))) {
                hasHomeItem = true;
            }
            
            // Determine if item is active
            var isActive = currentUrl === itemUrl || 
                          (itemUrl && itemUrl.length > 1 && currentUrl === itemUrl) ||
                          (itemUrl === '/' && (currentUrl === '/' || currentUrl.endsWith('/home')));
            
            var processedItem = {
                id: item.id || item.label,
                label: item.label,
                target: itemUrl,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive: isActive,
                activeClass: isActive ? 'nav-item active' : 'nav-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: item.subMenu && item.subMenu.length > 0,
                children: item.subMenu ? this.processSubMenu(item.subMenu) : []
            };
            
            processedItems.push(processedItem);
        }.bind(this));
        
        // Add home item if needed (only for header)
        var ensureHomeNavItem = component.get('v.ensureHomeNavItem');
        if (isHeader && ensureHomeNavItem && !hasHomeItem) {
            var homeItem = {
                id: 'home',
                label: 'Home',
                target: '/',
                type: 'InternalLink',
                imageUrl: null,
                isActive: currentUrl === '/' || currentUrl.endsWith('/home'),
                activeClass: (currentUrl === '/' || currentUrl.endsWith('/home')) ? 'nav-item active' : 'nav-item',
                ariaCurrent: (currentUrl === '/' || currentUrl.endsWith('/home')) ? 'page' : null,
                hasChildren: false,
                children: []
            };
            
            processedItems.unshift(homeItem);
        }
        
        return processedItems;
    },
    
    processSubMenu: function(subMenu) {
        if (!subMenu || subMenu.length === 0) {
            return [];
        }
        
        var currentUrl = window.location.pathname;
        return subMenu.map(function(item) {
            var isActive = currentUrl.includes(item.actionValue);
            
            return {
                id: item.id || item.label,
                label: item.label,
                target: item.actionValue,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive: isActive,
                activeClass: isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: false
            };
        });
    },
    
    initColumnMenusData: function(component) {
        var footerColumnMenus = component.get('v.footerColumnMenus');
        if (!footerColumnMenus) {
            return;
        }
        
        var footerNavigationMenuName = component.get('v.footerNavigationMenuName');
        var menus = footerColumnMenus.split(',').map(function(menu) {
            return menu.trim();
        });
        
        // Process each menu that's different from the main footer menu
        menus.forEach(function(menuName, index) {
            if (menuName && menuName !== footerNavigationMenuName) {
                this.fetchMenuData(component, menuName, index);
            }
        }.bind(this));
    },
    
    fetchMenuData: function(component, menuName, columnIndex) {
        if (!menuName || menuName.trim() === '') {
            return;
        }
        
        var action = component.get('c.getNavigationItems');
        action.setParams({
            menuName: menuName.trim()
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === 'SUCCESS') {
                var data = response.getReturnValue();
                var processedItems = this.processNavItems(component, data, false);
                
                // Store in column-specific data structure
                var columnMenusData = component.get('v.columnMenusData') || {};
                columnMenusData[columnIndex] = processedItems;
                component.set('v.columnMenusData', columnMenusData);
                
                this.processFooterColumns(component);
            } else {
                console.error('Error loading menu for column ' + columnIndex + ':', response.getError());
            }
        });
        
        $A.enqueueAction(action);
    },
    
    processFooterColumns: function(component) {
        var footerColumnCount = component.get('v.footerColumnCount');
        var footerColumnTitles = component.get('v.footerColumnTitles') || 'Products, Resources, Company';
        var footerNavItems = component.get('v.footerNavItems');
        var columnMenusData = component.get('v.columnMenusData') || {};
        
        var titles = footerColumnTitles.split(',').map(function(title) {
            return title.trim();
        });
        
        var columns = [];
        for (var i = 0; i < footerColumnCount; i++) {
            var columnItems = [];
            
            // Check if we have specific menu data for this column
            if (columnMenusData[i]) {
                columnItems = columnMenusData[i];
            } else if (footerNavItems && footerNavItems.length > 0) {
                // Divide main items among columns
                var totalItems = footerNavItems.length;
                var itemsPerColumn = Math.ceil(totalItems / footerColumnCount);
                var startIndex = i * itemsPerColumn;
                var endIndex = Math.min(startIndex + itemsPerColumn, totalItems);
                
                columnItems = footerNavItems.slice(startIndex, endIndex);
            }
            
            var columnTitle = i < titles.length ? titles[i] : 'Column ' + (i + 1);
            
            columns.push({
                index: i,
                title: columnTitle,
                items: columnItems
            });
        }
        
        component.set('v.footerColumnsWithItems', columns);
        this.updateComputedProperties(component);
    },
    
    processSocialLinks: function(component) {
        var socialLinksCount = component.get('v.socialLinksCount');
        var socialLinkTitles = component.get('v.socialLinkTitles') || 'Facebook, Twitter, LinkedIn, Instagram';
        var socialLinkUrls = component.get('v.socialLinkUrls') || '';
        
        var titles = socialLinkTitles.split(',').map(function(title) {
            return title.trim();
        });
        
        var urls = socialLinkUrls ? socialLinkUrls.split(',').map(function(url) {
            return url.trim();
        }) : [];
        
        var links = [];
        for (var i = 0; i < socialLinksCount; i++) {
            var title = i < titles.length ? titles[i] : 'Social Link ' + (i + 1);
            var url = i < urls.length ? urls[i] : '';
            
            if (url && url.trim() !== '') {
                var iconType = this.getSocialIconType(title);
                links.push({
                    index: i,
                    title: title,
                    url: url,
                    iconType: iconType,
                    isFacebook: iconType === 'facebook',
                    isTwitter: iconType === 'twitter',
                    isLinkedIn: iconType === 'linkedin',
                    isInstagram: iconType === 'instagram',
                    isYoutube: iconType === 'youtube',
                    isPinterest: iconType === 'pinterest',
                    isTiktok: iconType === 'tiktok',
                    isGithub: iconType === 'github',
                    isGeneric: iconType === 'generic'
                });
            }
        }
        
        component.set('v.socialLinks', links);
    },
    
    getSocialIconType: function(title) {
        var name = title.toLowerCase();
        if (name.includes('facebook')) return 'facebook';
        if (name.includes('twitter') || name.includes('x')) return 'twitter';
        if (name.includes('linkedin')) return 'linkedin';
        if (name.includes('instagram')) return 'instagram';
        if (name.includes('youtube')) return 'youtube';
        if (name.includes('pinterest')) return 'pinterest';
        if (name.includes('tiktok')) return 'tiktok';
        if (name.includes('github')) return 'github';
        return 'generic';
    },
    
    updateComputedProperties: function(component) {
        // Debug hero section visibility
        this.debugHeroSection(component);
        
        // Update theme class
        var themeName = component.get('v.themeName');
        component.set('v.themeClass', 'nuvitek-theme theme-' + themeName);
        
        // Update theme style
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        var accentColor = this.getSafeValue(component.get('v.accentColor'), '#D5DF23');
        var textColor = this.getSafeValue(component.get('v.textColor'), '#1d1d1f');
        
        var themeStyle = '--primary-color: ' + primaryColor + '; ' +
                        '--accent-color: ' + accentColor + '; ' +
                        '--text-color: ' + textColor + ';';
        component.set('v.themeStyle', themeStyle);
        
        // Update header class
        var scrolled = component.get('v.scrolled');
        var headerVariant = component.get('v.headerVariant');
        var headerClass = 'site-header';
        if (scrolled) headerClass += ' scrolled';
        if (headerVariant) headerClass += ' variant-' + headerVariant;
        component.set('v.headerClass', headerClass);
        
        // Update header style
        var headerSticky = component.get('v.headerSticky');
        var headerStyle = headerSticky ? 'position: sticky; top: 0;' : '';
        component.set('v.headerStyle', headerStyle);
        
        // Update header container style
        var headerContainerWidth = component.get('v.headerContainerWidth') || 100;
        component.set('v.headerContainerStyle', '--header-container-width: ' + headerContainerWidth + '%;');
        
        // Update logo style
        var logoUrl = component.get('v.logoUrl');
        var logoStyle = '';
        if (logoUrl && logoUrl.trim() !== '') {
            logoStyle = 'background-image: url(' + this.getResourcePath(logoUrl) + ');';
        }
        component.set('v.logoStyle', logoStyle);
        
        // Update hero properties
        var heroLayout = component.get('v.heroLayout');
        component.set('v.isHeroSplit', heroLayout === 'split');
        component.set('v.isHeroFullscreen', heroLayout === 'fullwidth');
        component.set('v.heroSectionClass', 'hero-section layout-' + heroLayout);
        
        // Update hero background style
        var heroBackgroundImage = component.get('v.heroBackgroundImage');
        var showBackgroundVideo = component.get('v.showBackgroundVideo');
        var heroBackgroundStyle = '';
        if (heroBackgroundImage && heroBackgroundImage.trim() !== '' && !showBackgroundVideo) {
            var resourcePath = this.getResourcePath(heroBackgroundImage);
            console.log('Hero background image:', heroBackgroundImage);
            console.log('Generated resource path:', resourcePath);
            console.log('Current URL:', window.location.href);
            
            // Test if the image can be loaded
            var self = this;
            this.testImageLoad(resourcePath, function(success) {
                if (!success) {
                    console.warn('Failed to load image at:', resourcePath);
                    console.log('Running comprehensive path testing...');
                    
                    // Test all possible resource paths
                    self.testAllResourcePaths(heroBackgroundImage, function(workingPaths) {
                        if (workingPaths.length > 0) {
                            console.log('✅ Found working path(s)! Use one of these paths:', workingPaths);
                            console.log('📝 To fix: Update your static resource path to use:', workingPaths[0].path);
                        } else {
                            console.log('❌ No working paths found. Check if:');
                            console.log('  1. Static resource "' + heroBackgroundImage + '" exists');
                            console.log('  2. Static resource is deployed to this org');
                            console.log('  3. You have the correct permissions to access it');
                            console.log('  4. The resource name is spelled correctly');
                        }
                    });
                } else {
                    console.log('✅ Image loaded successfully at:', resourcePath);
                }
            });
            
            heroBackgroundStyle = 'background-image: url(' + resourcePath + '); background-size: cover; background-position: center; background-repeat: no-repeat;';
        }
        component.set('v.heroBackgroundStyle', heroBackgroundStyle);
        
        // Update hero overlay style
        var heroBackgroundDarkness = component.get('v.heroBackgroundDarkness') || 0;
        var heroOverlayStyle = this.getHeroOverlayStyle(heroBackgroundDarkness);
        component.set('v.heroOverlayStyle', heroOverlayStyle);
        
        // Update hero subtitle style
        var heroSubtitleStyle = this.getHeroSubtitleStyle(heroBackgroundDarkness);
        component.set('v.heroSubtitleStyle', heroSubtitleStyle);
        
        // Update video overlay style
        var backgroundVideoDarkness = component.get('v.backgroundVideoDarkness') || 35;
        var videoOverlayStyle = 'background-color: rgba(0, 0, 0, ' + (backgroundVideoDarkness / 100) + ');';
        component.set('v.videoOverlayStyle', videoOverlayStyle);
        
        // Update resolved video URL
        var backgroundVideoUrl = component.get('v.backgroundVideoUrl');
        if (backgroundVideoUrl && backgroundVideoUrl.trim() !== '') {
            var resolvedVideoUrl = this.getResourcePath(backgroundVideoUrl);
            console.log('Video URL:', backgroundVideoUrl);
            console.log('Resolved video URL:', resolvedVideoUrl);
            component.set('v.resolvedVideoUrl', resolvedVideoUrl);
        } else {
            component.set('v.resolvedVideoUrl', '');
        }
        
        // Update footer properties
        var footerStyle = component.get('v.footerStyle');
        component.set('v.isMinimalFooter', footerStyle === 'minimal');
        component.set('v.shouldShowFooterColumns', footerStyle === 'multi-column');
        component.set('v.footerClass', 'site-footer style-' + footerStyle);
        
        // Update footer columns style
        var footerColumnsStyle = this.getFooterColumnsStyle(component);
        component.set('v.footerColumnsStyle', footerColumnsStyle);
        
        // Update mobile menu classes
        var mobileMenuOpen = component.get('v.mobileMenuOpen');
        component.set('v.mobileMenuButtonClass', mobileMenuOpen ? 'menu-button active' : 'menu-button');
        component.set('v.mobileMenuClass', mobileMenuOpen ? 'mobile-menu open' : 'mobile-menu');
        
        // Update FAB classes
        var fabMenuOpen = component.get('v.fabMenuOpen');
        var helpFormOpen = component.get('v.helpFormOpen');
        var llmAssistantOpen = component.get('v.llmAssistantOpen');
        
        component.set('v.fabMenuClass', fabMenuOpen ? 'fab-menu open' : 'fab-menu');
        component.set('v.helpFormDialogClass', helpFormOpen ? 'dialog support-requester-dialog open' : 'dialog support-requester-dialog');
        component.set('v.llmAssistantDialogClass', llmAssistantOpen ? 'help-form-dialog open' : 'help-form-dialog');
        component.set('v.backdropClass', (helpFormOpen || llmAssistantOpen) ? 'dialog-backdrop active' : 'dialog-backdrop');
        
        // Update scroll indicator class
        var showBackgroundVideo = component.get('v.showBackgroundVideo');
        var scrollIndicatorClass = 'scroll-indicator';
        if (showBackgroundVideo) {
            scrollIndicatorClass += ' on-video-background';
        }
        component.set('v.scrollIndicatorClass', scrollIndicatorClass);
        
        // Update shouldShowHeader
        var useDefaultHeader = component.get('v.useDefaultHeader');
        var shouldShowHeader = false;
        if (useDefaultHeader) {
            var headerNavigationMenuName = component.get('v.headerNavigationMenuName');
            var showProfileIcon = component.get('v.showProfileIcon');
            var showSearchInHeader = component.get('v.showSearchInHeader');
            var logoUrl = component.get('v.logoUrl');
            var ensureHomeNavItem = component.get('v.ensureHomeNavItem');
            
            var hasNavigation = headerNavigationMenuName && headerNavigationMenuName.trim() !== '';
            var hasHeaderContent = hasNavigation || showProfileIcon || showSearchInHeader || logoUrl || ensureHomeNavItem;
            shouldShowHeader = hasHeaderContent;
        }
        component.set('v.shouldShowHeader', shouldShowHeader);
    },
    
    getFooterColumnsStyle: function(component) {
        var footerStyle = component.get('v.footerStyle');
        var footerColumnCount = component.get('v.footerColumnCount');
        
        if (footerStyle === 'minimal' || footerStyle === 'standard') {
            return 'display: flex; justify-content: center; flex-wrap: wrap; gap: var(--spacing-lg);';
        } else {
            return 'grid-template-columns: repeat(' + footerColumnCount + ', 1fr);';
        }
    },
    
    getHeroOverlayStyle: function(heroBackgroundDarkness) {
        if (heroBackgroundDarkness === 0) {
            return 'background: none;';
        }
        
        var opacity = Math.abs(heroBackgroundDarkness) / 100;
        
        if (heroBackgroundDarkness < 0) {
            return 'background: linear-gradient(to bottom, rgba(0, 0, 0, ' + opacity + '), rgba(0, 0, 0, ' + (opacity * 1.2) + '));';
        }
        
        return 'background: linear-gradient(to bottom, rgba(255, 255, 255, ' + opacity + '), rgba(255, 255, 255, ' + opacity + '));';
    },
    
    getHeroSubtitleStyle: function(heroBackgroundDarkness) {
        if (heroBackgroundDarkness > 30) {
            return 'color: rgba(33, 33, 33, 0.95); text-shadow: none;';
        } else {
            return 'color: rgba(255, 255, 255, 0.95); text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);';
        }
    },
    
    getSafeValue: function(value, defaultValue) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined' || value === '') {
            return defaultValue || '';
        }
        return value;
    },
    
    testImageLoad: function(imagePath, callback) {
        var img = new Image();
        img.onload = function() {
            callback(true);
        };
        img.onerror = function() {
            callback(false);
        };
        img.src = imagePath;
    },
    
    testAllResourcePaths: function(resourceName, callback) {
        var self = this;
        var baseUrl = window.location.origin;
        var currentUrl = window.location.href;
        
        var pathsToTest = [
            '/resource/' + resourceName,
            baseUrl + '/resource/' + resourceName,
            '/sfsites/c/resource/' + resourceName,
            baseUrl + '/sfsites/c/resource/' + resourceName,
            '/lightning/resource/' + resourceName,
            baseUrl + '/lightning/resource/' + resourceName,
            '/sfsites/c/resource/' + resourceName + '/' + resourceName,
            baseUrl + '/sfsites/c/resource/' + resourceName + '/' + resourceName
        ];
        
        console.log('Testing all possible paths for:', resourceName);
        
        var testResults = [];
        var completedTests = 0;
        
        pathsToTest.forEach(function(path, index) {
            self.testImageLoad(path, function(success) {
                testResults.push({
                    path: path,
                    success: success,
                    index: index
                });
                
                completedTests++;
                
                if (success) {
                    console.log('✅ SUCCESS: Image loaded at:', path);
                } else {
                    console.log('❌ FAILED: Image failed to load at:', path);
                }
                
                if (completedTests === pathsToTest.length) {
                    var workingPaths = testResults.filter(function(result) {
                        return result.success;
                    });
                    
                    console.log('=== RESOURCE PATH TEST RESULTS ===');
                    console.log('Working paths:', workingPaths);
                    console.log('====================================');
                    
                    if (callback) {
                        callback(workingPaths);
                    }
                }
            });
                 });
     },
     
     debugHeroSection: function(component) {
         console.log('=== HERO SECTION DEBUG ===');
         
         // Check all hero-related attributes
         var showHeroSection = component.get('v.showHeroSection');
         var heroLayout = component.get('v.heroLayout');
         var heroTitle = component.get('v.heroTitle');
         var heroSubtitle = component.get('v.heroSubtitle');
         var heroBackgroundImage = component.get('v.heroBackgroundImage');
         var showBackgroundVideo = component.get('v.showBackgroundVideo');
         var heroBackgroundDarkness = component.get('v.heroBackgroundDarkness');
         
         console.log('showHeroSection:', showHeroSection);
         console.log('heroLayout:', heroLayout);
         console.log('heroTitle:', heroTitle);
         console.log('heroSubtitle:', heroSubtitle);
         console.log('heroBackgroundImage:', heroBackgroundImage);
         console.log('showBackgroundVideo:', showBackgroundVideo);
         console.log('heroBackgroundDarkness:', heroBackgroundDarkness);
         
         // Check computed properties
         var isHeroSplit = component.get('v.isHeroSplit');
         var isHeroFullscreen = component.get('v.isHeroFullscreen');
         var heroSectionClass = component.get('v.heroSectionClass');
         var heroBackgroundStyle = component.get('v.heroBackgroundStyle');
         var heroOverlayStyle = component.get('v.heroOverlayStyle');
         var heroSubtitleStyle = component.get('v.heroSubtitleStyle');
         
         console.log('isHeroSplit:', isHeroSplit);
         console.log('isHeroFullscreen:', isHeroFullscreen);
         console.log('heroSectionClass:', heroSectionClass);
         console.log('heroBackgroundStyle:', heroBackgroundStyle);
         console.log('heroOverlayStyle:', heroOverlayStyle);
         console.log('heroSubtitleStyle:', heroSubtitleStyle);
         
         // Check if hero section element exists in DOM
         setTimeout(function() {
             var componentElement = component.getElement();
             if (componentElement) {
                 var heroSection = componentElement.querySelector('.hero-section');
                 var heroContainer = componentElement.querySelector('.hero-container');
                 var heroContent = componentElement.querySelector('.hero-content');
                 var heroTitle = componentElement.querySelector('.hero-title');
                 
                 console.log('DOM Elements:');
                 console.log('  heroSection element:', heroSection);
                 console.log('  heroContainer element:', heroContainer);
                 console.log('  heroContent element:', heroContent);
                 console.log('  heroTitle element:', heroTitle);
                 
                 if (heroSection) {
                     var computedStyle = window.getComputedStyle(heroSection);
                     console.log('Hero Section Computed Styles:');
                     console.log('  display:', computedStyle.display);
                     console.log('  visibility:', computedStyle.visibility);
                     console.log('  opacity:', computedStyle.opacity);
                     console.log('  height:', computedStyle.height);
                     console.log('  min-height:', computedStyle.minHeight);
                     console.log('  background-image:', computedStyle.backgroundImage);
                     console.log('  background-color:', computedStyle.backgroundColor);
                     console.log('  z-index:', computedStyle.zIndex);
                     console.log('  position:', computedStyle.position);
                     
                     // Check if it's visible in viewport
                     var rect = heroSection.getBoundingClientRect();
                     console.log('Hero Section Position:');
                     console.log('  top:', rect.top);
                     console.log('  left:', rect.left);
                     console.log('  width:', rect.width);
                     console.log('  height:', rect.height);
                     console.log('  visible in viewport:', rect.height > 0 && rect.width > 0);
                     
                     // Check CSS classes
                     console.log('Hero Section CSS Classes:', heroSection.className);
                     
                     // Check if content exists
                     if (heroTitle) {
                         console.log('Hero title text:', heroTitle.textContent);
                         var titleStyle = window.getComputedStyle(heroTitle);
                         console.log('Hero title visibility:', titleStyle.visibility);
                         console.log('Hero title color:', titleStyle.color);
                     }
                 } else {
                     console.log('❌ Hero section element NOT found in DOM!');
                     console.log('Checking if showHeroSection condition is working...');
                     
                     // Look for the conditional rendering
                     var conditionalElements = componentElement.querySelectorAll('[data-aura-if]');
                     console.log('Found conditional elements:', conditionalElements.length);
                 }
                 
                 // Check for any overlapping elements
                 var allElements = componentElement.querySelectorAll('*');
                 var overlappingElements = [];
                 
                 if (heroSection) {
                     var heroRect = heroSection.getBoundingClientRect();
                     
                     for (var i = 0; i < allElements.length; i++) {
                         var element = allElements[i];
                         if (element !== heroSection && element.parentNode !== heroSection) {
                             var elementRect = element.getBoundingClientRect();
                             var elementStyle = window.getComputedStyle(element);
                             
                             // Check if element overlaps and has higher z-index
                             if (elementRect.top <= heroRect.bottom && 
                                 elementRect.bottom >= heroRect.top &&
                                 elementRect.left <= heroRect.right && 
                                 elementRect.right >= heroRect.left &&
                                 parseInt(elementStyle.zIndex) > parseInt(computedStyle.zIndex)) {
                                 
                                 overlappingElements.push({
                                     element: element,
                                     zIndex: elementStyle.zIndex,
                                     className: element.className
                                 });
                             }
                         }
                     }
                     
                     if (overlappingElements.length > 0) {
                         console.log('⚠️  Found potentially overlapping elements:', overlappingElements);
                     }
                 }
             } else {
                 console.log('❌ Component element not found!');
             }
             
                           console.log('=== END HERO DEBUG ===');
          }, 100);
      },
      
      // Manual debugging function for detailed DOM inspection
      debugHeroDOM: function(component) {
          console.log('=== DETAILED HERO DOM DEBUG ===');
          
          var componentElement = component.getElement();
          if (!componentElement) {
              console.log('❌ Component element not found!');
              return;
          }
          
          // Find all elements that might be the hero section
          var heroSections = componentElement.querySelectorAll('.hero-section, [class*="hero"], div[style*="background"]');
          console.log('Found potential hero elements:', heroSections.length);
          
          heroSections.forEach(function(element, index) {
              console.log('Hero Element #' + index + ':', element);
              console.log('  Classes:', element.className);
              console.log('  Styles:', element.getAttribute('style'));
              console.log('  Computed display:', window.getComputedStyle(element).display);
              console.log('  Inner HTML length:', element.innerHTML.length);
              console.log('  Dimensions:', element.getBoundingClientRect());
          });
          
          // Check aura:if conditions
          var auraIfs = componentElement.querySelectorAll('[data-aura-rendered-by]');
          console.log('Found aura:if rendered elements:', auraIfs.length);
          
          // Check the actual HTML structure
          console.log('Component HTML structure (first 1000 chars):');
          console.log(componentElement.innerHTML.substring(0, 1000));
          
          // Check for CSS that might be hiding content
          var styles = document.querySelectorAll('style');
          var relevantStyles = [];
          
          styles.forEach(function(style) {
              var content = style.textContent;
              if (content.includes('hero') || content.includes('.THIS')) {
                  relevantStyles.push({
                      content: content.substring(0, 500) + '...',
                      element: style
                  });
              }
          });
          
          console.log('Found relevant CSS styles:', relevantStyles.length);
          relevantStyles.forEach(function(style, index) {
              console.log('Style #' + index + ':', style.content);
          });
          
          console.log('=== END DETAILED DOM DEBUG ===');
      },
      
      getResourcePath: function(resourceName) {
        if (!resourceName || resourceName.trim() === '') {
            return '';
        }
        
        // If it's already a full URL, return it as-is
        if (resourceName.startsWith('http://') || resourceName.startsWith('https://') || resourceName.startsWith('//')) {
            console.log('Using full URL:', resourceName);
            return resourceName;
        }
        
        // If it starts with a slash, it's already a relative path
        if (resourceName.startsWith('/')) {
            console.log('Using relative path:', resourceName);
            return resourceName;
        }
        
        // Get the current domain and context
        var currentUrl = window.location.href;
        var baseUrl = window.location.origin;
        
        console.log('Getting resource path for:', resourceName);
        console.log('Current URL:', currentUrl);
        console.log('Base URL:', baseUrl);
        
        // Try different path formats for different environments
        var possiblePaths = [];
        
        // For Experience Cloud sites with /s/ prefix
        if (currentUrl.includes('/s/')) {
            possiblePaths.push(baseUrl + '/sfsites/c/resource/' + resourceName);
            possiblePaths.push('/sfsites/c/resource/' + resourceName);
        }
        
        // For Lightning Experience
        if (currentUrl.includes('/lightning/')) {
            possiblePaths.push(baseUrl + '/resource/' + resourceName);
            possiblePaths.push('/resource/' + resourceName);
        }
        
        // For Experience Cloud builder
        if (currentUrl.includes('/builder/')) {
            possiblePaths.push(baseUrl + '/resource/' + resourceName);
            possiblePaths.push('/resource/' + resourceName);
        }
        
        // For Experience Cloud sites without /s/
        if (currentUrl.includes('/Experience-Cloud/')) {
            possiblePaths.push(baseUrl + '/resource/' + resourceName);
            possiblePaths.push('/resource/' + resourceName);
        }
        
        // Check if we're in an org context
        if (currentUrl.includes('.salesforce.com') || currentUrl.includes('.force.com')) {
            possiblePaths.push(baseUrl + '/resource/' + resourceName);
            possiblePaths.push('/resource/' + resourceName);
        }
        
        // Common fallback paths
        possiblePaths.push('/resource/' + resourceName);
        possiblePaths.push(baseUrl + '/resource/' + resourceName);
        possiblePaths.push('/sfsites/c/resource/' + resourceName);
        possiblePaths.push(baseUrl + '/sfsites/c/resource/' + resourceName);
        
        // Try each path and return the first one that exists
        console.log('Possible paths to try:', possiblePaths);
        
        // Return the first path (we'll test it in the calling function)
        return possiblePaths[0] || ('/resource/' + resourceName);
    },
    
    performSearch: function(component, searchTerm, searchObjects) {
        var action = component.get('c.searchAcrossObjects');
        action.setParams({
            searchTerm: searchTerm,
            objectsToSearch: searchObjects
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            component.set('v.isSearching', false);
            
            if (state === 'SUCCESS') {
                var results = response.getReturnValue();
                component.set('v.searchResults', results);
            } else {
                console.error('Error performing search:', response.getError());
                component.set('v.searchResults', []);
            }
        });
        
        $A.enqueueAction(action);
    },
    
    navigateToUrl: function(component, type, target) {
        if (type === 'InternalLink') {
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        } else if (type === 'ExternalLink') {
            window.open(target, '_blank');
        } else {
            // Default fallback
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        }
    },
    
    navigateToRecord: function(component, recordId, objectType) {
        var navEvent = $A.get("e.force:navigateToSObject");
        navEvent.setParams({
            "recordId": recordId,
            "slideDevName": "detail"
        });
        navEvent.fire();
    },
    
    applyThemeStyles: function(component) {
        var applyThemeToSlots = component.get('v.applyThemeToSlots');
        var globalThemeOverride = component.get('v.globalThemeOverride');
        var themeName = component.get('v.themeName');
        
        // Apply dark theme to entire page if dark theme is active
        if (themeName === 'dark') {
            this.applyDarkThemeToPage(component);
            this.applyHeaderDarkness(component);
        }
        
        if (applyThemeToSlots) {
            this.applyThemeToSlottedContent(component);
        }
        
        if (globalThemeOverride) {
            this.applyStylesToOOTBComponents(component);
        }
    },
    
    applyDarkThemeToPage: function(component) {
        try {
            // Apply dark theme to body and html
            document.body.style.backgroundColor = '#1d1d1f';
            document.body.style.color = '#f5f5f7';
            document.documentElement.style.backgroundColor = '#1d1d1f';
            
            // Create a global style for dark theme
            var existingStyle = document.getElementById('nuvitek-dark-theme-global');
            if (existingStyle) {
                existingStyle.remove();
            }
            
            var darkThemeStyle = document.createElement('style');
            darkThemeStyle.id = 'nuvitek-dark-theme-global';
            darkThemeStyle.textContent = `
                body, html {
                    background-color: #1d1d1f !important;
                    color: #f5f5f7 !important;
                }
                
                /* Only apply dark background to main content areas */
                .main-content, .content-container {
                    background-color: #1d1d1f !important;
                }
                
                /* Ensure text is readable but don't override everything */
                .main-content p, .main-content h1, .main-content h2, .main-content h3, 
                .main-content h4, .main-content h5, .main-content h6, .main-content span, 
                .main-content a {
                    color: #f5f5f7 !important;
                }
            `;
            
            document.head.appendChild(darkThemeStyle);
            
            console.log('✅ Dark theme applied to entire page');
            
        } catch (error) {
            console.error('Error applying dark theme to page:', error);
        }
    },

    applyHeaderDarkness: function(component) {
        try {
            var heroBackgroundDarkness = component.get('v.heroBackgroundDarkness') || 30;
            var themeName = component.get('v.themeName');
            
            if (themeName === 'dark') {
                // Calculate header darkness based on heroBackgroundDarkness
                // Higher heroBackgroundDarkness = darker header
                var baseDarkness = Math.max(0.7, Math.min(0.98, heroBackgroundDarkness / 100));
                var scrolledDarkness = Math.max(0.8, Math.min(0.99, (heroBackgroundDarkness + 10) / 100));
                
                // Set CSS custom properties for header darkness
                var headerElement = component.find('.site-header');
                if (headerElement && headerElement.getElement()) {
                    var element = headerElement.getElement();
                    element.style.setProperty('--header-darkness', 'rgba(29, 29, 31, ' + baseDarkness + ')');
                    element.style.setProperty('--header-darkness-scrolled', 'rgba(32, 32, 36, ' + scrolledDarkness + ')');
                }
                
                // Also apply to the component root for global access
                var rootElement = component.getElement();
                if (rootElement) {
                    rootElement.style.setProperty('--header-darkness', 'rgba(29, 29, 31, ' + baseDarkness + ')');
                    rootElement.style.setProperty('--header-darkness-scrolled', 'rgba(32, 32, 36, ' + scrolledDarkness + ')');
                }
                
                console.log('✅ Header darkness applied:', baseDarkness, 'scrolled:', scrolledDarkness);
            }
        } catch (error) {
            console.error('Error applying header darkness:', error);
        }
    },
    
    applyThemeToSlottedContent: function(component) {
        // Apply theme variables to slotted content and facets
        try {
            // Target all themed containers and their children
            var themedContainers = component.getElement().querySelectorAll('.nuvitek-themed-component, .nuvitek-themed-header, .nuvitek-themed-footer');
            
            themedContainers.forEach(function(container) {
                this.applyThemeVariablesToElement(component, container);
                
                // Also apply to any child components within the facets
                var childComponents = container.querySelectorAll('*');
                childComponents.forEach(function(child) {
                    this.applyThemeVariablesToElement(component, child);
                }.bind(this));
            }.bind(this));
            
            // Apply to any Aura components as well
            var auraComponents = component.getElement().querySelectorAll('[data-aura-class]');
            auraComponents.forEach(function(auraComp) {
                auraComp.classList.add('nuvitek-themed-component');
                this.applyThemeVariablesToElement(component, auraComp);
            }.bind(this));
        } catch (error) {
            console.error('Error applying theme to slotted content:', error);
        }
    },
    
    applyStylesToOOTBComponents: function(component) {
        try {
            var globalStyle = document.createElement('style');
            globalStyle.id = 'nuvitek-global-theme-override';
            globalStyle.textContent = this.getGlobalOverrideStyles(component);
            document.head.appendChild(globalStyle);
        } catch (error) {
            console.error('Error applying global styles:', error);
        }
    },
    
    applyThemeVariablesToElement: function(component, element) {
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        var accentColor = this.getSafeValue(component.get('v.accentColor'), '#D5DF23');
        var textColor = this.getSafeValue(component.get('v.textColor'), '#1d1d1f');
        var themeName = component.get('v.themeName');
        
        element.style.setProperty('--primary-color', primaryColor);
        element.style.setProperty('--accent-color', accentColor);
        element.style.setProperty('--text-color', textColor);
        
        if (themeName === 'dark') {
            element.style.setProperty('--background', '#1d1d1f');
            element.style.setProperty('--background-alt', '#2d2d2f');
            element.style.setProperty('--text-secondary', '#a1a1a6');
        } else {
            element.style.setProperty('--background', '#ffffff');
            element.style.setProperty('--background-alt', '#f5f5f7');
            element.style.setProperty('--text-secondary', '#6e6e73');
        }
    },
    
    getGlobalOverrideStyles: function(component) {
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        
        return `
            .THIS .slds-button_brand,
            .THIS .slds-button--brand,
            :host .slds-button_brand,
            :host .slds-button--brand,
            lightning-button.slds-button_brand,
            lightning-button.slds-button--brand {
                background-color: ${primaryColor} !important;
                border-color: ${primaryColor} !important;
            }
            
            .THIS .slds-card,
            :host .slds-card,
            lightning-card {
                border-radius: 12px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            }
        `;
    },
    
    injectSvgIcons: function(component) {
        var self = this;
        
        try {
            var componentElement = component.getElement();
            if (!componentElement) return;
            
            // Define SVG icons
            var svgIcons = {
                'chevron-down': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
                'search': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
                'user': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
                'arrow-right': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
                'plus': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                'chat': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                'einstein': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            };
            
            // Inject icons for dropdown indicators
            var dropdownIndicators = componentElement.querySelectorAll('.dropdown-indicator-svg');
            dropdownIndicators.forEach(function(indicator) {
                var iconType = indicator.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    indicator.innerHTML = svgIcons[iconType];
                    indicator.classList.add('dropdown-indicator');
                }
            });
            
            // Inject icons for search buttons
            var searchIcons = componentElement.querySelectorAll('.search-icon-svg');
            searchIcons.forEach(function(icon) {
                var iconType = icon.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    icon.innerHTML = svgIcons[iconType];
                }
            });
            
            // Inject icons for profile links
            var profileIcons = componentElement.querySelectorAll('.profile-icon-svg');
            profileIcons.forEach(function(icon) {
                var iconType = icon.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    icon.innerHTML = svgIcons[iconType];
                }
            });
            
            // Inject icons for scroll indicators
            var scrollIcons = componentElement.querySelectorAll('.scroll-icon-svg');
            scrollIcons.forEach(function(icon) {
                var iconType = icon.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    icon.innerHTML = svgIcons[iconType];
                }
            });
            
            // Inject icons for CTA buttons
            var ctaIcons = componentElement.querySelectorAll('.cta-icon-svg');
            ctaIcons.forEach(function(icon) {
                var iconType = icon.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    icon.innerHTML = svgIcons[iconType];
                }
            });
            
            // Inject FAB icons
            var fabIcon = componentElement.querySelector('.fab-icon-svg');
            if (fabIcon) {
                fabIcon.innerHTML = svgIcons['plus'];
            }
            
            var fabMenuIcons = componentElement.querySelectorAll('.fab-menu-icon-svg');
            fabMenuIcons.forEach(function(icon) {
                var iconType = icon.getAttribute('data-icon');
                if (svgIcons[iconType]) {
                    icon.innerHTML = svgIcons[iconType];
                }
            });
            
        } catch (error) {
            console.error('Error injecting SVG icons:', error);
        }
    },
    
})