import * as React from "react";

import {
    Button,
    Grid,
    MenuItem,
    Paper,
    Select,
    Switch,
} from '@material-ui/core';

import {
    withStyles,
} from '@material-ui/core/styles';

import {
    Engine,
} from "babylonjs";

import GUI, { enumDefaultPosition } from "./GUI";
import Sample, { enumSplitMode } from "./Sample";

export default class MainGUI extends GUI {

    protected _parent:      Sample;

    constructor(name: string, engine: Engine, parent: Sample) {
        super(name, engine);

        this._parent = parent;

        this.dimensions.width = 250;
        this.dimensions.height = 214;
        this.showCloseButton = false;
        this.defaultPosition = enumDefaultPosition.TOP_LEFT;
    }

    protected handleEvent(event: Event): boolean {
        return false;
    }

    protected createCustomGUI(): React.ReactElement {
        const GridQwerty = withStyles({
            root: {
                maxWidth: 60,
            },
        })(Grid);

        const Properties = () => {
            const classes = this._useStyles();
            const [splitLayout, setSplitLayout] = React.useState(this._parent.splitMode);
            const [splitType, setSplitType] = React.useState(this._parent.splitType);
            const [qwertyMode, setQwertyMode] = React.useState(this._parent.qwertyMode);

            const changeSplitLayout = (event: React.ChangeEvent<{ name?: string | undefined; value: unknown }>, child: React.ReactNode) => {
                this._parent.splitMode = event.target.value as number;
                setSplitLayout(this._parent.splitMode);
            };

            const changeSplitType = (event: React.ChangeEvent<{ name?: string | undefined; value: unknown }>, child: React.ReactNode) => {
                this._parent.splitType = event.target.value as string;
                setSplitType(this._parent.splitType);
            };

            const changeQwertyMode = (event: React.ChangeEvent, checked: boolean) => {
                setQwertyMode(checked);
                this._parent.qwertyMode = checked;
            };

            React.useEffect(() => {
                const handler = (event: Event) => {
                    switch ((event as CustomEvent).detail.type) {
                        case 'setSplitLayout': {
                            setSplitLayout(this._parent.splitMode);
                            break;
                        }
                    }
                };

                window.addEventListener('gui_set_value', handler);

                return () => {
                    window.removeEventListener('gui_set_value', handler);
                };
            }, []);

            return (
                <Grid container spacing={1}>
                    <Grid item xs={6}>
                        <Paper className={classes.propertyTitle}>QWERTY mode</Paper>
                    </Grid>
                    <GridQwerty item xs={6} className={classes.propertyValue}>
                        <Paper className={classes.propertyValue}>
                            <Switch checked={qwertyMode} onChange={changeQwertyMode} />
                        </Paper>
                    </GridQwerty>
                    <Grid item xs={6}>
                        <Paper className={classes.propertyTitle}>Split layout</Paper>
                    </Grid>
                    <Grid item xs={6}>
                        <Select
                            className={classes.propertyValue}
                            id="splitlayout"
                            value={splitLayout}
                            onChange={changeSplitLayout}
                            >
                            <MenuItem value={enumSplitMode.SIDE_BY_SIDE}>Side by side</MenuItem>
                            <MenuItem value={enumSplitMode.LINEAR}>Linear</MenuItem>
                        </Select>
                    </Grid>
                    <Grid item xs={6}>
                        <Paper className={classes.propertyTitle}>Split type</Paper>
                    </Grid>
                    <Grid item xs={6}>
                        <Select
                            className={classes.propertyValue}
                            id="splittype"
                            value={splitType}
                            onChange={changeSplitType}
                            >
                            { Array.from(this._parent.splitClasses.keys()).map((name) => {
                                const stype = this._parent.splitClasses.get(name)!;
                                return (
                                    <MenuItem key={name} value={name}>{stype.className}</MenuItem>
                                );
                            }) }
                        </Select>
                    </Grid>
                    {this.createCustomGUIProperties()}
                    <Grid item xs={12} style={{ textAlign: 'center', marginTop: '8px' }}>
                        <Button variant="contained" color="primary" onClick={this._parent.createNewSplit.bind(this._parent)}>
                            Create Split
                        </Button>
                    </Grid>
                </Grid>
            );
        };

        return Properties();
    }

    protected createCustomGUIProperties(): React.ReactElement {
        return (
            <React.Fragment>
            </React.Fragment>
        );
    }

}
