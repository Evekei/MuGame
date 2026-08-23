package com.mugame.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.mugame.mobile.plugins.NeteaseAuthPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NeteaseAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
