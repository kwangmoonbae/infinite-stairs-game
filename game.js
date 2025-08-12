class InfiniteStairsGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.gameRunning = false;
        this.score = 0;
        this.gameTime = 0;
        this.maxBPM = 0;
        
        this.player = {
            x: 400,
            y: 476,
            width: 139,
            height: 124,
            direction: 1, // 1 for right, -1 for left
            isMoving: false,
            currentFrame: 0,
            frameTime: 0,
            animation: 'idle'
        };
        
        this.camera = {
            y: 0,
            targetY: 0
        };
        
        this.stairs = [];
        this.stairWidth = 120;
        this.stairHeight = 40;
        this.stairSpacing = 60;
        
        this.stepTimes = [];
        this.currentBPM = 0;
        this.lastStepTime = 0;
        
        this.audio = null;
        this.audioContext = null;
        this.audioSource = null;
        
        this.spriteSheet = null;
        this.spriteData = null;
        
        this.difficultyLevel = 0;
        
        this.init();
    }
    
    async init() {
        await this.loadAssets();
        this.setupEventListeners();
        this.generateInitialStairs();
        this.startGame();
    }
    
    async loadAssets() {
        this.spriteSheet = new Image();
        await new Promise((resolve) => {
            this.spriteSheet.onload = resolve;
            this.spriteSheet.src = 'character_sprite.png';
        });
        
        const response = await fetch('final_character_atlas.json');
        this.spriteData = await response.json();
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioResponse = await fetch('music.mp3');
            const audioBuffer = await audioResponse.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(audioBuffer);
        } catch (error) {
            console.warn('Audio loading failed:', error);
        }
    }
    
    setupEventListeners() {
        document.getElementById('climbBtn').addEventListener('click', () => this.climb());
        document.getElementById('directionBtn').addEventListener('click', () => this.changeDirection());
        document.getElementById('restartBtn').addEventListener('click', () => this.restart());
        
        document.addEventListener('keydown', (e) => {
            if (!this.gameRunning) return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.climb();
                    break;
                case 'ArrowLeft':
                case 'ArrowRight':
                    e.preventDefault();
                    this.changeDirection();
                    break;
            }
        });
        
        let touchStartX = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchStartX = e.touches[0].clientX;
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touchEndX = e.changedTouches[0].clientX;
            const touchDiff = touchEndX - touchStartX;
            
            if (Math.abs(touchDiff) > 50) {
                this.changeDirection();
            } else {
                this.climb();
            }
        });
    }
    
    generateInitialStairs() {
        this.stairs = [];
        let currentX = 400;
        let currentY = 516;
        
        this.stairs.push({
            x: currentX,
            y: currentY,
            width: this.stairWidth,
            height: this.stairHeight
        });
        
        let direction = 1; // Start going right
        
        for (let i = 0; i < 100; i++) {
            const chainLength = this.getChainLength();
            
            // Generate a chain of stairs in the current direction
            for (let j = 0; j < chainLength; j++) {
                currentY -= this.stairSpacing;
                currentX += direction * (this.stairWidth + 10);
                
                this.stairs.push({
                    x: currentX,
                    y: currentY,
                    width: this.stairWidth,
                    height: this.stairHeight
                });
            }
            
            direction *= -1;
        }
    }
    
    getChainLength() {
        const level = Math.floor(this.score / 50);
        
        if (level < 1) {
            const rand = Math.random();
            if (rand < 0.7) return 4 + Math.floor(Math.random() * 2);
            if (rand < 0.9) return 2 + Math.floor(Math.random() * 2);
            return 1;
        } else if (level < 4) {
            const rand = Math.random();
            if (rand < 0.4) return 4 + Math.floor(Math.random() * 2);
            if (rand < 0.8) return 2 + Math.floor(Math.random() * 2);
            return 1;
        } else if (level < 10) {
            const rand = Math.random();
            if (rand < 0.2) return 4 + Math.floor(Math.random() * 2);
            if (rand < 0.5) return 2 + Math.floor(Math.random() * 2);
            return 1;
        } else {
            const rand = Math.random();
            if (rand < 0.1) return 4 + Math.floor(Math.random() * 2);
            if (rand < 0.3) return 2 + Math.floor(Math.random() * 2);
            return 1;
        }
    }
    
    climb() {
        if (!this.gameRunning) return;
        
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const currentTime = Date.now();
        this.recordStep(currentTime);
        
        const nextStair = this.findNextStair();
        
        if (!nextStair) {
            this.gameOver();
            return;
        }
        
        this.player.x = nextStair.x + nextStair.width / 2 - this.player.width / 2;
        this.player.y = nextStair.y - this.player.height;
        this.player.isMoving = true;
        this.player.animation = 'walk';
        
        this.camera.targetY = this.player.y - 300;
        
        this.score++;
        this.updateUI();
        
        if (this.score % 10 === 0) {
            this.generateMoreStairs();
        }
        
        this.updateMusicBPM();
    }
    
    changeDirection() {
        if (!this.gameRunning) return;
        
        this.player.direction *= -1;
        this.climb(); // Also climb when changing direction
    }
    
    findNextStair() {
        const playerCenterX = this.player.x + this.player.width / 2;
        const playerY = this.player.y;
        
        // Look for the next stair above the player in the current direction
        let bestStair = null;
        let minDistance = Infinity;
        
        for (let stair of this.stairs) {
            if (stair.y >= playerY - this.stairHeight) continue;
            
            const stairCenterX = stair.x + stair.width / 2;
            const stairY = stair.y;
            
            const expectedX = playerCenterX + (this.player.direction * (this.stairWidth + 10));
            const expectedY = playerY - this.stairSpacing;
            
            const xDistance = Math.abs(stairCenterX - expectedX);
            const yDistance = Math.abs(stairY - expectedY);
            
            if (xDistance < 150 && yDistance < 80) {
                const totalDistance = xDistance + yDistance;
                if (totalDistance < minDistance) {
                    minDistance = totalDistance;
                    bestStair = stair;
                }
            }
        }
        
        return bestStair;
    }
    
    generateMoreStairs() {
        const topStair = this.stairs.reduce((top, stair) => 
            stair.y < top.y ? stair : top
        );
        
        let currentX = topStair.x;
        let currentY = topStair.y;
        let direction = Math.random() > 0.5 ? 1 : -1;
        
        for (let i = 0; i < 6; i++) {
            const chainLength = this.getChainLength();
            
            // Generate a chain of stairs in the current direction
            for (let j = 0; j < chainLength; j++) {
                currentY -= this.stairSpacing;
                currentX += direction * (this.stairWidth + 10);
                
                this.stairs.push({
                    x: currentX,
                    y: currentY,
                    width: this.stairWidth,
                    height: this.stairHeight
                });
            }
            
            direction *= -1;
        }
    }
    
    recordStep(currentTime) {
        this.stepTimes.push(currentTime);
        
        const oneMinuteAgo = currentTime - 60000;
        this.stepTimes = this.stepTimes.filter(time => time > oneMinuteAgo);
        
        if (this.stepTimes.length > 1) {
            this.currentBPM = this.stepTimes.length;
            this.maxBPM = Math.max(this.maxBPM, this.currentBPM);
        }
    }
    
    updateMusicBPM() {
        if (!this.audioContext || !this.audioBuffer) return;
        
        if (this.audioSource) {
            this.audioSource.stop();
        }
        
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.loop = true;
        
        const originalBPM = 176;
        const targetBPM = Math.max(60, this.currentBPM);
        const playbackRate = targetBPM / originalBPM;
        
        this.audioSource.playbackRate.value = playbackRate;
        this.audioSource.connect(this.audioContext.destination);
        this.audioSource.start();
    }
    
    startGame() {
        this.gameRunning = true;
        this.gameTime = 0;
        
        if (this.audioContext && this.audioBuffer) {
            this.audioSource = this.audioContext.createBufferSource();
            this.audioSource.buffer = this.audioBuffer;
            this.audioSource.loop = true;
            this.audioSource.playbackRate.value = 0.5; // Start slow
            this.audioSource.connect(this.audioContext.destination);
            this.audioSource.start();
        }
        
        this.gameLoop();
    }
    
    gameLoop() {
        if (!this.gameRunning) return;
        
        this.update();
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update() {
        this.gameTime += 1/60;
        
        this.camera.y += (this.camera.targetY - this.camera.y) * 0.1;
        
        this.updatePlayerAnimation();
        
        this.updateUI();
    }
    
    updatePlayerAnimation() {
        this.player.frameTime += 1/60;
        
        if (this.player.frameTime >= this.spriteData.frameDuration) {
            this.player.frameTime = 0;
            
            const animation = this.spriteData.animations[this.player.animation];
            if (animation && animation.length > 0) {
                this.player.currentFrame = (this.player.currentFrame + 1) % animation.length;
            }
        }
        
        if (this.player.isMoving) {
            setTimeout(() => {
                this.player.isMoving = false;
                this.player.animation = 'idle';
            }, 200);
        }
    }
    
    render() {
        this.ctx.fillStyle = '#0f3460';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(0, -this.camera.y);
        
        this.renderStairs();
        
        this.renderPlayer();
        
        this.ctx.restore();
    }
    
    renderStairs() {
        this.ctx.fillStyle = '#8B4513';
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 2;
        
        for (let stair of this.stairs) {
            const screenY = stair.y + this.camera.y;
            if (screenY > -100 && screenY < this.canvas.height + 100) {
                this.ctx.fillRect(stair.x, stair.y, stair.width, stair.height);
                this.ctx.strokeRect(stair.x, stair.y, stair.width, stair.height);
            }
        }
    }
    
    renderPlayer() {
        if (!this.spriteSheet || !this.spriteData) return;
        
        const animation = this.spriteData.animations[this.player.animation];
        if (!animation || animation.length === 0) return;
        
        const frameName = animation[this.player.currentFrame];
        const frameData = this.spriteData.frames[frameName];
        
        if (!frameData) return;
        
        this.ctx.save();
        
        if (this.player.direction === -1) {
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(
                this.spriteSheet,
                frameData.x, frameData.y, frameData.w, frameData.h,
                -(this.player.x + this.player.width), this.player.y, this.player.width, this.player.height
            );
        } else {
            this.ctx.drawImage(
                this.spriteSheet,
                frameData.x, frameData.y, frameData.w, frameData.h,
                this.player.x, this.player.y, this.player.width, this.player.height
            );
        }
        
        this.ctx.restore();
    }
    
    updateUI() {
        document.getElementById('score').textContent = `Score: ${this.score}`;
        document.getElementById('bpm').textContent = `BPM: ${this.currentBPM}`;
        document.getElementById('timer').textContent = `Time: ${Math.floor(this.gameTime)}s`;
    }
    
    gameOver() {
        this.gameRunning = false;
        
        if (this.audioSource) {
            this.audioSource.stop();
        }
        
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('maxBPM').textContent = this.maxBPM;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
    
    restart() {
        this.score = 0;
        this.gameTime = 0;
        this.maxBPM = 0;
        this.currentBPM = 0;
        this.stepTimes = [];
        
        this.player.x = 400;
        this.player.y = 476;
        this.player.direction = 1;
        this.player.isMoving = false;
        this.player.animation = 'idle';
        this.player.currentFrame = 0;
        
        this.camera.y = 0;
        this.camera.targetY = 0;
        
        document.getElementById('gameOverScreen').classList.add('hidden');
        
        this.generateInitialStairs();
        
        this.startGame();
    }
}

window.addEventListener('load', () => {
    new InfiniteStairsGame();
});
