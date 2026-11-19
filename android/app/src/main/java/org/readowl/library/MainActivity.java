package org.readowl.library;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import org.readowl.library.updater.AppUpdaterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
