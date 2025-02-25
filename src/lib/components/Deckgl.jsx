import {BASEMAP} from '@deck.gl/carto';
import {DeckGL} from '@deck.gl/react';
import React, {useCallback, useEffect, useState, useRef} from 'react';
import {Map} from 'react-map-gl';

import {ConverterProvider, useConverter} from './utils/json-converter';
import {loadMapboxCSS} from './utils/mapbox-utils';
import makeTooltip from './utils/widget-tooltip';

import './style.css';

const useDebounce = (value, milliSeconds) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, milliSeconds);

        return () => {
            clearTimeout(handler);
        };
    }, [value, milliSeconds]);

    return debouncedValue;
};

const DeckglMap = ({
    spec,
    tooltips,
    width = '100%',
    height = 500,
    events = [],
    description,
    overlay,
    mapbox_key,
    setProps,
    lastevent,
    viewstate,
    landmask,
    merge_layers,
    cursor_position = 'none',
    preserveDrawingBuffer,
}) => {
    const [primaryProps, setPrimaryProps] = useState({layers: []});
    const [overlayProps, setOverlayProps] = useState({});
    const [layerStack, setLayerStack] = useState([]);
    const [librariesLoaded, setLibrariesLoaded] = useState(false);
    const [configurationLoaded, setConfigurationLoaded] = useState(false);
    const jsonConverter = useConverter();
    const [vState, setVState] = useState(viewstate);
    const dbViewState = useDebounce(vState, 500);

    const cursorpos = useRef();

    const descriptions = [];
    if (description) {
        for (const key in description) {
            if (
                [
                    'top-right',
                    'top-left',
                    'bottom-right',
                    'bottom-left',
                ].includes(key)
            ) {
                const pos = key.split('-');
                descriptions.push({pos, content: description[key]});
            }
        }
    }
    const cp = [
        'top-right',
        'top-left',
        'bottom-right',
        'bottom-left',
    ].includes(cursor_position)
        ? cursor_position.split('-')
        : null;

    const handleEvent = useCallback(
        (eventType, info) => {
            if (events.includes(eventType)) {
                setProps({
                    lastevent: {
                        layerId: info.layer && info.layer.id,
                        ...info.object,
                        coordinate: info.coordinate,
                        eventType,
                    },
                    viewstate: dbViewState,
                });
            }
            if (eventType === 'hover' && cp && cursorpos.current) {
                const coords = info.coordinate;
                if (coords)
                    cursorpos.current.innerHTML =
                        coords[0].toFixed(4) + ', ' + coords[1].toFixed(4);
            }
        },
        [events, dbViewState]
    );

    const handlers = {
        onClick: (info) => handleEvent('click', info),
        onHover: (info) => handleEvent('hover', info),
        onDragStart: (info) => handleEvent('drag-start', info),
        onDrag: (info) => handleEvent('drag', info),
        onDragEnd: (info) => handleEvent('drag-end', info),
    };

    const getTooltip = makeTooltip(tooltips);

    const sharedProps = {
        ...handlers,
        getTooltip,
    };

    useEffect(() => {
        loadMapboxCSS();
    }, []);

    useEffect(() => {
        const _spec = JSON.parse(spec);
        const _layer_ids = _spec.layers.map((l) => l.id);
        const _new_layer_ids = merge_layers
            ? layerStack.concat(
                  _layer_ids.filter((l) => !layerStack.includes(l))
              )
            : _layer_ids;
        setLayerStack(_new_layer_ids);
        const newPrimaryProps = jsonConverter.convert(spec);
        let newLayers = merge_layers
            ? _new_layer_ids.map(
                  (lid) =>
                      newPrimaryProps.layers.find((l) => !!l && l.id == lid) ||
                      primaryProps.layers.find((l) => !!l && l.id == lid) ||
                      null //Insert new layers in correct order
              )
            : newPrimaryProps.layers;
        // if (primaryProps.layers && primaryProps.layers.length && merge_layers) {
        //     newLayers = primaryProps.layers
        //         .map((l) => newLayers.find((nl) => nl.id === l.id) || l)
        //         .concat(
        //             newLayers.filter(
        //                 (nl) => !primaryProps.layers.find((l) => l.id === nl.id)
        //             )
        //         );
        // }
        if (newPrimaryProps.initialViewState) {
            if (
                !vState ||
                (newPrimaryProps.initialViewState.longitude &&
                    newPrimaryProps.initialViewState.latitude)
            ) {
                setVState(newPrimaryProps.initialViewState);
            }
        }
        console.log(newLayers);
        setPrimaryProps({
            ...primaryProps,
            ...newPrimaryProps,
            layers: newLayers,
        });
    }, [spec, jsonConverter]);

    useEffect(() => {
        const newOverlayProps = jsonConverter.convert(overlay);
        setOverlayProps({...overlayProps, ...newOverlayProps});
    }, [overlay, jsonConverter]);

    useEffect(() => {
        if (viewstate && Object.keys(viewstate).length > 0) {
            setVState({...vState, ...viewstate});
        }
    }, [viewstate]);

    useEffect(() => {
        setProps({viewstate: dbViewState});
    }, [dbViewState]);

    const updateViewState = useCallback(({viewState}) => {
        setVState(viewState);
    }, []);

    return (
        <div
            className="deckgl-map"
            style={{height, width, position: 'relative'}}
        >
            <div id="deckgl-primary" style={{width: '100%', height: '100%'}}>
                {vState && (
                    <DeckGL
                        viewState={vState}
                        onViewStateChange={updateViewState}
                        {...sharedProps}
                        {...primaryProps}
                        getCursor={({isDragging, isHovering}) =>
                            isDragging
                                ? 'grabbing'
                                : isHovering
                                ? 'pointer'
                                : 'crosshair'
                        }
                        controller={{touchRotate: true}}
                        glOptions={{
                            preserveDrawingBuffer: preserveDrawingBuffer,
                        }}
                    >
                        <Map
                            mapStyle={primaryProps.mapStyle || BASEMAP.POSITRON}
                            mapboxAccessToken={mapbox_key}
                            preserveDrawingBuffer={preserveDrawingBuffer}
                        />
                        {landmask && landmask.map_style && (
                            <Map
                                id="landmask"
                                mapStyle={landmask.map_style}
                                mapboxAccessToken={mapbox_key}
                                preserveDrawingBuffer={preserveDrawingBuffer}
                            />
                        )}
                    </DeckGL>
                )}
            </div>
            {overlay && (
                <div
                    id="deckgl-overlay"
                    style={{
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                    }}
                >
                    <DeckGL
                        viewState={vState}
                        contoller={false}
                        {...sharedProps}
                        {...overlayProps}
                        style={{
                            ...overlayProps.style,
                            zIndex: 1,
                            pointerEvents: 'none',
                        }}
                    >
                        <Map
                            mapStyle={overlayProps.mapStyle}
                            mapboxAccessToken={mapbox_key}
                        />
                    </DeckGL>
                </div>
            )}
            {descriptions.map((d, i) => (
                <div
                    key={i}
                    className="deckgl-description"
                    style={{
                        position: 'absolute',
                        zIndex: 10,
                        [d.pos[0]]: d.pos[0] == 'top' ? 10 : 20,
                        [d.pos[1]]: 10,
                    }}
                    dangerouslySetInnerHTML={{__html: d.content}}
                />
            ))}
            {cp && (
                <div
                    ref={cursorpos}
                    className={'deckgl-cursor-position'}
                    style={{
                        position: 'absolute',
                        zIndex: 20,
                        [cp[1]]: 10,
                        [cp[0]]: cp[0] == 'top' ? 10 : 20,
                    }}
                ></div>
            )}
        </div>
    );
};

const Deckgl = (props) => {
    return (
        <ConverterProvider
            customLibraries={props.custom_libraries}
            configuration={props.configuration}
        >
            <DeckglMap {...props} />
        </ConverterProvider>
    );
};

export default Deckgl;
