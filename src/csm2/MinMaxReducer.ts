import {
    Camera,
    Constants,
    Effect,
    PostProcess,
    PostProcessManager,
    Nullable,
    RenderTargetTexture,
    Observable,
    Observer,
} from "babylonjs";

/**
 * This class computes a min/max reduction from a texture: it means it computes the minimum
 * and maximum values from all values of the texture.
 * It is performed on the GPU for better performances, thanks to a succession of post processes.
 * The values are read from the red channel of the texture.
 */
export class MinMaxReducer {

    /**
     * Observable triggered when the computation has been performed
     */
    public onAfterReductionPerformed = new Observable<{ min: number, max: number }>();

    protected _camera: Camera;
    protected _sourceTexture: Nullable<RenderTargetTexture>;
    protected _reductionSteps: Nullable<Array<PostProcess>>;
    protected _postProcessManager: PostProcessManager;
    protected _onAfterUnbindObserver: Nullable<Observer<RenderTargetTexture>>;
    protected _forceFullscreenViewport = true;

    /**
     * Creates a min/max reducer
     * @param camera The camera to use for the post processes
     */
    constructor(camera: Camera) {
        MinMaxReducer.registerShader();

        this._camera = camera;
        this._postProcessManager = new PostProcessManager(camera.getScene());
    }

    /**
     * Gets the texture used to read the values from.
     */
    public get sourceTexture(): Nullable<RenderTargetTexture> {
        return this._sourceTexture;
    }

    /**
     * Sets the source texture to read the values from.
     * One must indicate if the texture is a depth texture or not through the depthRedux parameter
     * because in such textures '1' value must not be taken into account to compute the maximum
     * as this value is used to clear the texture.
     * Note that the computation is not activated by calling this function, you must call activate() for that!
     * @param sourceTexture The texture to read the values from. The values should be in the red channel.
     * @param depthRedux Indicates if the texture is a depth texture or not
     * @param type The type of the textures created for the reduction (defaults to TEXTURETYPE_HALF_FLOAT)
     * @param forceFullscreenViewport Forces the post processes used for the reduction to be applied without taking into account viewport (defaults to true)
     */
    public setSourceTexture(sourceTexture: RenderTargetTexture, depthRedux: boolean, type: number = Constants.TEXTURETYPE_HALF_FLOAT, forceFullscreenViewport = true): void {
        if (sourceTexture === this._sourceTexture) {
            return;
        }

        this.dispose(false);

        this._sourceTexture = sourceTexture;
        this._reductionSteps = [];
        this._forceFullscreenViewport = forceFullscreenViewport;

        const scene = this._camera.getScene();

        // create the first step
        let reductionInitial = new PostProcess(
            'Initial reduction phase',
            'minmaxReducer', // shader
            ['texSize'],
            ['sourceTexture'], // textures
            1.0, // options
            null, // camera
            Constants.TEXTURE_NEAREST_NEAREST, // sampling
            scene.getEngine(), // engine
            false, // reusable
            "#define INITIAL" + (depthRedux ? "\n#define DEPTH_REDUX" : ""), // defines
            type,
            undefined,
            undefined,
            undefined,
            Constants.TEXTUREFORMAT_RG,
        );

        reductionInitial.autoClear = false;
        reductionInitial.forceFullscreenViewport = forceFullscreenViewport;

        let w = this._sourceTexture.getRenderWidth(), h = this._sourceTexture.getRenderHeight();

        reductionInitial.onApply = ((w: number, h: number) => {
            return (effect: Effect) => {
                effect.setTexture('sourceTexture', this._sourceTexture);
                effect.setFloatArray2('texSize', new Float32Array([w, h]));
            };
        })(w, h);

        this._reductionSteps.push(reductionInitial);

        let index = 1;

        // create the additional steps
        while (w > 1 || h > 1) {
            w = Math.max(Math.round(w / 2), 1);
            h = Math.max(Math.round(h / 2), 1);

            let reduction = new PostProcess(
                'Reduction phase ' + index,
                'minmaxReducer', // shader
                ['texSize'],
                null,
                { width: w, height: h }, // options
                null, // camera
                Constants.TEXTURE_NEAREST_NEAREST, // sampling
                scene.getEngine(), // engine
                false, // reusable
                "#define " + ((w == 1 && h == 1) ? 'LAST' : (w == 1 || h == 1) ? 'ONEBEFORELAST' : 'MAIN'), // defines
                type,
                undefined,
                undefined,
                undefined,
                Constants.TEXTUREFORMAT_RG,
            );

            reduction.autoClear = false;
            reduction.forceFullscreenViewport = forceFullscreenViewport;

            reduction.onApply = ((w: number, h: number) => {
                return (effect: Effect) => {
                    if (w == 1 || h == 1) {
                        effect.setIntArray2('texSize', new Int32Array([w, h]));
                    } else {
                        effect.setFloatArray2('texSize', new Float32Array([w, h]));
                    }
                };
            })(w, h);

            this._reductionSteps.push(reduction);

            index++;

            if (w == 1 && h == 1) {
                let func = (w: number, h: number, reduction: PostProcess) => {
                    let buffer = new Float32Array(4 * w * h),
                        minmax = { min: 0, max: 0};
                    return () => {
                        scene.getEngine()._readTexturePixels(reduction.inputTexture, w, h, -1, 0, buffer);
                        minmax.min = buffer[0];
                        minmax.max = buffer[1];
                        this.onAfterReductionPerformed.notifyObservers(minmax);
                    };
                };
                reduction.onAfterRenderObservable.add(func(w, h, reduction));
            }
        }
    }

    /**
     * Defines the refresh rate of the computation.
     * Use 0 to compute just once, 1 to compute on every frame, 2 to compute every two frames and so on...
     */
    public get refreshRate(): number {
        return this._sourceTexture ? this._sourceTexture.refreshRate : -1;
    }

    public set refreshRate(value: number) {
        if (this._sourceTexture) {
            this._sourceTexture.refreshRate = value;
        }
    }

    protected _activated = false;

    /**
     * Gets the activation status of the reducer
     */
    public get activated(): boolean {
        return this._activated;
    }

    /**
     * Activates the reduction computation.
     * When activated, the observers registered in onAfterReductionPerformed are
     * called after the compuation is performed
     */
    public activate(): void {
        if (this._onAfterUnbindObserver || !this._sourceTexture) {
            return;
        }

        this._onAfterUnbindObserver = this._sourceTexture.onAfterUnbindObservable.add(() => {
            this._reductionSteps![0].activate(this._camera);
            this._postProcessManager.directRender(this._reductionSteps!, this._reductionSteps![0].inputTexture, this._forceFullscreenViewport);
            this._camera.getScene().getEngine().unBindFramebuffer(this._reductionSteps![0].inputTexture, false);
        });

        this._activated = true;
    }

    /**
     * Deactivates the reduction computation.
     */
    public deactivate(): void {
        if (!this._onAfterUnbindObserver || !this._sourceTexture) {
            return;
        }

        this._sourceTexture.onAfterUnbindObservable.remove(this._onAfterUnbindObserver);
        this._onAfterUnbindObserver = null;
        this._activated = false;
    }

    /**
     * Disposes the min/max reducer
     * @param disposeAll true to dispose all the resources. You should always call this function with true as the parameter (or without any parameter as it is the default one). This flag is meant to be used internally.
     */
    public dispose(disposeAll = true): void {
        if (disposeAll) {
            this.onAfterReductionPerformed.clear();
        }

        this.deactivate();

        if (this._reductionSteps) {
            for (let i = 0; i < this._reductionSteps.length; ++i) {
                this._reductionSteps[i].dispose();
            }
            this._reductionSteps = null;
        }

        if (this._postProcessManager && disposeAll) {
            this._postProcessManager.dispose();
        }

        this._sourceTexture = null;
    }

    public static registerShader(): void {
        Effect.ShadersStore.minmaxReducerFragmentShader = `
            #version 300 es
            precision highp float;
            precision highp int;

            in vec2 vUV;

            uniform sampler2D textureSampler;

            out vec2 glFragColor;

        #ifdef INITIAL
            uniform sampler2D sourceTexture;
            uniform vec2 texSize;

            void main(void)
            {
                ivec2 coord = ivec2(vUV * (texSize - 1.0));

                float f1 = texelFetch(sourceTexture, coord, 0).r;
                float f2 = texelFetch(sourceTexture, coord + ivec2(1, 0), 0).r;
                float f3 = texelFetch(sourceTexture, coord + ivec2(1, 1), 0).r;
                float f4 = texelFetch(sourceTexture, coord + ivec2(0, 1), 0).r;

                float minz = min(min(min(f1, f2), f3), f4);
                #ifdef DEPTH_REDUX
                    float maxz = max(max(max(sign(1.0 - f1) * f1, sign(1.0 - f2) * f2), sign(1.0 - f3) * f3), sign(1.0 - f4) * f4);
                #else
                    float maxz = max(max(max(f1, f2), f3), f4);
                #endif

                glFragColor = vec2(minz, maxz);
            }

        #elif defined(MAIN)
            uniform vec2 texSize;

            void main(void)
            {
                ivec2 coord = ivec2(vUV * (texSize - 1.0));

                vec2 f1 = texelFetch(textureSampler, coord, 0).rg;
                vec2 f2 = texelFetch(textureSampler, coord + ivec2(1, 0), 0).rg;
                vec2 f3 = texelFetch(textureSampler, coord + ivec2(1, 1), 0).rg;
                vec2 f4 = texelFetch(textureSampler, coord + ivec2(0, 1), 0).rg;

                float minz = min(min(min(f1.x, f2.x), f3.x), f4.x);
                float maxz = max(max(max(f1.y, f2.y), f3.y), f4.y);

                glFragColor = vec2(minz, maxz);
            }

        #elif defined(ONEBEFORELAST)
            uniform ivec2 texSize;

            void main(void)
            {
                ivec2 coord = ivec2(vUV * vec2(texSize - 1));

                vec2 f1 = texelFetch(textureSampler, coord % texSize, 0).rg;
                vec2 f2 = texelFetch(textureSampler, (coord + ivec2(1, 0)) % texSize, 0).rg;
                vec2 f3 = texelFetch(textureSampler, (coord + ivec2(1, 1)) % texSize, 0).rg;
                vec2 f4 = texelFetch(textureSampler, (coord + ivec2(0, 1)) % texSize, 0).rg;

                float minz = min(f1.x, f2.x);
                float maxz = max(f1.y, f2.y);

                glFragColor = vec2(minz, maxz);
            }

        #elif defined(LAST)
            void main(void)
            {
                discard;
                glFragColor = vec2(0.);
            }
        #endif
        `;
    }
}